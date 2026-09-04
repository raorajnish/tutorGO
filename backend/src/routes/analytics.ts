import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { money } from "../lib/money.js";
import { todayDateOnly, subtractDays } from "../lib/dateOnly.js";

export const analyticsRouter = Router();

// Fee/payroll figures live here, same sensitivity bar as fees.ts/payroll.ts —
// OWNER/ADMIN only, no ACCOUNTANT/FACULTY read access for this first pass.
analyticsRouter.use(authenticate, requireInstitute, requireRoles("OWNER", "ADMIN"));

const PRESENT_STATUSES = ["PRESENT", "PRESENT_BIOMETRIC", "LATE"] as const;

const rangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /// Narrows enrollment/lectures/attendance/tests/fees to one course, or one
  /// specific batch within it. Payroll/expenses stay institute-wide — a
  /// "this batch" view of staff payroll or building rent isn't a meaningful
  /// question, so those two sections ignore this filter entirely.
  courseId: z.string().optional(),
  batchId: z.string().optional(),
});

/** Every analytics endpoint takes the same `?from=&to=&courseId=&batchId=`
 * set, defaulting to the trailing 90 days across the whole institute —
 * bounded enough to keep every query in this file fast without an explicit
 * "term" concept the data model doesn't have yet. */
function resolveRange(query: unknown): { from: Date; to: Date; courseId?: string; batchId?: string } {
  const parsed = rangeSchema.parse(query);
  const to = parsed.to ?? todayDateOnly();
  const from = parsed.from ?? subtractDays(to, 90);
  return { from, to, courseId: parsed.courseId, batchId: parsed.batchId };
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// Institute analysis
// ---------------------------------------------------------------------------

interface Scope {
  courseId?: string;
  batchId?: string;
}

analyticsRouter.get("/institute", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const { from, to, courseId, batchId } = resolveRange(req.query);
    const scope: Scope = { courseId, batchId };

    // Payroll and expenses are deliberately institute-wide always — see the
    // comment on rangeSchema.batchId for why a course/batch filter doesn't
    // apply to either.
    const [enrollment, lectures, attendance, tests, fees, payroll, expenses] = await Promise.all([
      buildEnrollment(instituteId, from, to, scope),
      buildLectures(instituteId, from, to, scope),
      buildAttendance(instituteId, from, to, scope),
      buildTests(instituteId, from, to, scope),
      buildFees(instituteId, from, to, scope),
      buildPayroll(instituteId, from, to),
      buildExpenses(instituteId, from, to),
    ]);

    res.json({
      range: { from, to },
      scope,
      enrollment,
      lectures,
      attendance,
      tests,
      fees,
      payroll,
      expenses,
      finance: buildFinance(fees, payroll, expenses),
    });
  } catch (err) {
    next(err);
  }
});

async function buildEnrollment(instituteId: string, from: Date, to: Date, scope: Scope) {
  // A batch is scoped to one course, so filtering by batch means "students
  // currently in that batch" rather than the broader courseId condition.
  const studentWhere = scope.batchId
    ? { instituteId, isActive: true, batches: { some: { batchId: scope.batchId, leftAt: null } } }
    : { instituteId, isActive: true, courseId: scope.courseId };

  const [totalActive, admissionsInRange, byCourseRaw, admissionDates] = await Promise.all([
    prisma.student.count({ where: studentWhere }),
    prisma.student.count({ where: { ...studentWhere, isActive: undefined, admissionDate: { gte: from, lte: to } } }),
    prisma.student.groupBy({
      by: ["courseId"],
      where: studentWhere,
      _count: { _all: true },
    }),
    // Only the one column needed to bucket a trend — never the full row.
    prisma.student.findMany({
      where: { ...studentWhere, isActive: undefined, admissionDate: { gte: from, lte: to } },
      select: { admissionDate: true },
    }),
  ]);

  const courses = await prisma.course.findMany({
    where: { id: { in: byCourseRaw.map((c) => c.courseId) } },
    select: { id: true, name: true, code: true },
  });
  const courseById = new Map(courses.map((c) => [c.id, c]));

  return {
    totalActive,
    admissionsInRange,
    byCourse: byCourseRaw
      .map((c) => ({ course: courseById.get(c.courseId) ?? null, count: c._count._all }))
      .sort((a, b) => b.count - a.count),
    admissionsTrend: bucketByWeek(admissionDates.map((s) => s.admissionDate)),
  };
}

async function buildLectures(instituteId: string, from: Date, to: Date, scope: Scope) {
  // Narrow projection, not full Lecture rows — this is the count that
  // answers "how many lectures per course", nothing else needs to travel.
  const rows = await prisma.lecture.findMany({
    where: {
      instituteId,
      date: { gte: from, lte: to },
      batchId: scope.batchId,
      batch: scope.batchId ? undefined : { courseId: scope.courseId },
    },
    select: { cancelledAt: true, batch: { select: { courseId: true } } },
  });

  const byCourse = new Map<string, { held: number; cancelled: number }>();
  for (const row of rows) {
    const entry = byCourse.get(row.batch.courseId) ?? { held: 0, cancelled: 0 };
    if (row.cancelledAt) entry.cancelled += 1;
    else entry.held += 1;
    byCourse.set(row.batch.courseId, entry);
  }

  const courses = await prisma.course.findMany({
    where: { id: { in: [...byCourse.keys()] } },
    select: { id: true, name: true, code: true },
  });
  const courseById = new Map(courses.map((c) => [c.id, c]));

  return {
    total: rows.length,
    cancelled: rows.filter((r) => r.cancelledAt).length,
    byCourse: [...byCourse.entries()]
      .map(([courseId, counts]) => ({ course: courseById.get(courseId) ?? null, ...counts }))
      .sort((a, b) => b.held - a.held),
  };
}

async function buildAttendance(instituteId: string, from: Date, to: Date, scope: Scope) {
  // $queryRaw can't take an optional Prisma relation filter the way the
  // client API does, so the course/batch narrowing is an explicit extra
  // clause, always present but harmless when both are null (a null column
  // compared with `= NULL` never matches, so `OR NULL IS NULL` is what makes
  // "no filter" behave as "no filter" here rather than "match nothing").
  const [overall, weekly] = await Promise.all([
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: {
        lecture: {
          instituteId,
          date: { gte: from, lte: to },
          batchId: scope.batchId,
          batch: scope.batchId ? undefined : { courseId: scope.courseId },
        },
      },
      _count: { _all: true },
    }),
    // Date-bucketed aggregation is exactly what SQL is for — a Prisma groupBy
    // has no date-trunc, and pulling every record into Node just to bucket
    // it in JS would be the one truly wasteful query in this file. Injection-
    // safe: every interpolated value is a bound parameter, never raw string
    // concatenation.
    prisma.$queryRaw<{ week: Date; present: bigint; total: bigint }[]>`
      SELECT date_trunc('week', l."date") AS week,
             count(*) FILTER (WHERE ar."status" IN ('PRESENT', 'PRESENT_BIOMETRIC', 'LATE')) AS present,
             count(*) AS total
      FROM attendance_records ar
      JOIN lectures l ON l."id" = ar."lectureId"
      JOIN batches b ON b."id" = l."batchId"
      WHERE l."instituteId" = ${instituteId} AND l."date" >= ${from} AND l."date" <= ${to}
        AND (${scope.batchId ?? null}::text IS NULL OR l."batchId" = ${scope.batchId ?? null})
        AND (${scope.courseId ?? null}::text IS NULL OR b."courseId" = ${scope.courseId ?? null})
      GROUP BY week
      ORDER BY week
    `,
  ]);

  const byStatus = Object.fromEntries(overall.map((o) => [o.status, o._count._all]));
  const total = overall.reduce((sum, o) => sum + o._count._all, 0);
  const present = PRESENT_STATUSES.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);

  return {
    overallPercent: pct(present, total),
    byStatus,
    trend: weekly.map((w) => ({
      label: w.week.toISOString().slice(0, 10),
      value: pct(Number(w.present), Number(w.total)),
    })),
  };
}

async function buildTests(instituteId: string, from: Date, to: Date, scope: Scope) {
  // One query for every test in range plus its result stats — a per-test
  // threshold comparison (marksObtained >= passingMarks) can't be expressed
  // as a single generic Prisma aggregate, and looping createdTests in JS to
  // fetch each one's stats would be exactly the N+1 this file exists to
  // avoid. The row count here is bounded by test count, not result count.
  //
  // Test has no batchId of its own (one test can run as sessions across
  // several batches), so the batch filter is an EXISTS against its sessions
  // rather than a plain column comparison the way courseId is.
  const rows = await prisma.$queryRaw<
    {
      testId: string;
      title: string;
      totalMarks: number;
      passingMarks: number | null;
      courseId: string;
      courseName: string;
      subjectId: string;
      subjectName: string;
      attempts: bigint;
      avgMarks: number | null;
      passed: bigint;
    }[]
  >`
    SELECT t."id" AS "testId", t."title", t."totalMarks", t."passingMarks",
           c."id" AS "courseId", c."name" AS "courseName",
           s."id" AS "subjectId", s."name" AS "subjectName",
           count(tr."id") AS attempts,
           avg(tr."marksObtained") AS "avgMarks",
           count(*) FILTER (WHERE t."passingMarks" IS NOT NULL AND tr."marksObtained" >= t."passingMarks") AS passed
    FROM tests t
    JOIN courses c ON c."id" = t."courseId"
    JOIN subjects s ON s."id" = t."subjectId"
    LEFT JOIN test_results tr ON tr."testId" = t."id"
    WHERE t."instituteId" = ${instituteId}
      -- Scoped by when the test actually ran (its session dates), not by
      -- t."createdAt" — a test entered into the system today for a session
      -- back in June should count as a June test, not a "today" one; the
      -- original createdAt filter silently excluded every test whose entry
      -- happened to fall outside the window even though the session itself
      -- was well inside it.
      AND EXISTS (SELECT 1 FROM lectures l WHERE l."testId" = t."id" AND l."date" >= ${from} AND l."date" <= ${to})
      AND (${scope.courseId ?? null}::text IS NULL OR t."courseId" = ${scope.courseId ?? null})
      AND (
        ${scope.batchId ?? null}::text IS NULL
        OR EXISTS (SELECT 1 FROM lectures l WHERE l."testId" = t."id" AND l."batchId" = ${scope.batchId ?? null})
      )
    GROUP BY t."id", c."id", c."name", s."id", s."name"
  `;

  const totalAttempts = rows.reduce((sum, r) => sum + Number(r.attempts), 0);
  const totalPassed = rows.reduce((sum, r) => sum + Number(r.passed), 0);
  // Each test's own percentage (avgMarks / totalMarks) weighted by how many
  // students actually attempted it, so one small-cohort test can't skew the
  // institute-wide figure as much as the batch everyone sat.
  const weightedPercentSum = rows.reduce(
    (sum, r) => sum + (r.avgMarks !== null ? (Number(r.avgMarks) / r.totalMarks) * 100 * Number(r.attempts) : 0),
    0
  );

  const byCourse = new Map<string, { course: { id: string; name: string }; attempts: number; passed: number; percentSum: number }>();
  for (const r of rows) {
    const entry = byCourse.get(r.courseId) ?? {
      course: { id: r.courseId, name: r.courseName },
      attempts: 0,
      passed: 0,
      percentSum: 0,
    };
    entry.attempts += Number(r.attempts);
    entry.passed += Number(r.passed);
    entry.percentSum += r.avgMarks !== null ? (Number(r.avgMarks) / r.totalMarks) * 100 * Number(r.attempts) : 0;
    byCourse.set(r.courseId, entry);
  }

  return {
    testCount: rows.length,
    totalAttempts,
    averagePercent: totalAttempts > 0 ? Math.round((weightedPercentSum / totalAttempts) * 10) / 10 : 0,
    passRate: pct(totalPassed, totalAttempts),
    byCourse: [...byCourse.values()]
      .map((c) => ({
        course: c.course,
        attempts: c.attempts,
        passRate: pct(c.passed, c.attempts),
        averagePercent: c.attempts > 0 ? Math.round((c.percentSum / c.attempts) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts),
  };
}

async function buildFees(instituteId: string, from: Date, to: Date, scope: Scope) {
  // A batch is scoped to one course, so the student-relation filter mirrors
  // buildEnrollment's studentWhere exactly — same "currently in this batch"
  // vs. "admitted to this course" distinction.
  const studentFilter = scope.batchId
    ? { batches: { some: { batchId: scope.batchId, leftAt: null } } }
    : { courseId: scope.courseId };

  const [totals, collectedAgg, overdueRows, monthlyRows] = await Promise.all([
    prisma.feeInstallment.aggregate({
      where: { feeAccount: { instituteId, student: studentFilter } },
      _sum: { amount: true, paidAmount: true },
    }),
    prisma.payment.aggregate({
      where: { instituteId, voidedAt: null, paidOn: { gte: from, lte: to }, feeAccount: { student: studentFilter } },
      _sum: { amount: true },
    }),
    // Same technique as fees.ts GET /overdue — a Decimal column comparison
    // (paidAmount < amount) isn't expressible as a Prisma where filter, so
    // the candidates are narrowed in SQL (waived/dueDate/status) and the
    // exact comparison happens in JS over just two columns per row.
    prisma.feeInstallment.findMany({
      where: {
        waived: false,
        dueDate: { lt: todayDateOnly() },
        feeAccount: { instituteId, status: "ACTIVE", student: studentFilter },
      },
      select: { amount: true, paidAmount: true },
    }),
    // Monthly collection trend — same date_trunc technique as the
    // attendance/payroll trends, scoped the same way as the totals above.
    prisma.$queryRaw<{ month: Date; amount: number }[]>`
      SELECT date_trunc('month', p."paidOn") AS month, sum(p."amount") AS amount
      FROM payments p
      JOIN fee_accounts fa ON fa."id" = p."feeAccountId"
      JOIN students st ON st."id" = fa."studentId"
      WHERE p."instituteId" = ${instituteId} AND p."voidedAt" IS NULL
        AND p."paidOn" >= ${from} AND p."paidOn" <= ${to}
        AND (${scope.batchId ?? null}::text IS NULL OR EXISTS (
          SELECT 1 FROM student_batches sb WHERE sb."studentId" = st."id" AND sb."batchId" = ${scope.batchId ?? null} AND sb."leftAt" IS NULL
        ))
        AND (${scope.batchId ? null : (scope.courseId ?? null)}::text IS NULL OR st."courseId" = ${scope.batchId ? null : (scope.courseId ?? null)})
      GROUP BY month
      ORDER BY month
    `,
  ]);

  const totalDue = Number(totals._sum.amount ?? 0);
  const totalPaid = Number(totals._sum.paidAmount ?? 0);
  const overdue = overdueRows.filter((r) => Number(r.paidAmount) < Number(r.amount));
  const overdueAmount = overdue.reduce((sum, r) => sum + (Number(r.amount) - Number(r.paidAmount)), 0);

  return {
    totalDue: money(totalDue),
    totalCollected: money(totalPaid),
    coveragePercent: pct(totalPaid, totalDue),
    collectedInRange: money(Number(collectedAgg._sum.amount ?? 0)),
    overdueCount: overdue.length,
    overdueAmount: money(overdueAmount),
    collectedTrend: monthlyRows.map((m) => ({ label: m.month.toISOString().slice(0, 7), value: Number(m.amount) })),
  };
}

async function buildPayroll(instituteId: string, from: Date, to: Date) {
  const fromMonth = from.toISOString().slice(0, 7);
  const toMonth = to.toISOString().slice(0, 7);

  const byMonth = await prisma.payrollLineItem.groupBy({
    by: ["periodMonth"],
    where: {
      salaryProfile: { instituteId },
      periodMonth: { gte: fromMonth, lte: toMonth },
    },
    _sum: { amount: true, paidAmount: true },
    orderBy: { periodMonth: "asc" },
  });

  const paidInRange = byMonth.reduce((sum, m) => sum + Number(m._sum.paidAmount ?? 0), 0);
  const totalInRange = byMonth.reduce((sum, m) => sum + Number(m._sum.amount ?? 0), 0);

  return {
    totalInRange: money(totalInRange),
    paidInRange: money(paidInRange),
    trend: byMonth.map((m) => ({ label: m.periodMonth, value: Number(m._sum.amount ?? 0) })),
  };
}

async function buildExpenses(instituteId: string, from: Date, to: Date) {
  const [total, byCategoryRaw, monthlyRows] = await Promise.all([
    prisma.expense.aggregate({ where: { instituteId, date: { gte: from, lte: to } }, _sum: { amount: true } }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: { instituteId, date: { gte: from, lte: to } },
      _sum: { amount: true },
    }),
    prisma.$queryRaw<{ month: Date; amount: number }[]>`
      SELECT date_trunc('month', e."date") AS month, sum(e."amount") AS amount
      FROM expenses e
      WHERE e."instituteId" = ${instituteId} AND e."date" >= ${from} AND e."date" <= ${to}
      GROUP BY month
      ORDER BY month
    `,
  ]);

  const categories = await prisma.expenseCategory.findMany({
    where: { id: { in: byCategoryRaw.map((c) => c.categoryId) } },
    select: { id: true, name: true },
  });
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return {
    totalInRange: money(Number(total._sum.amount ?? 0)),
    byCategory: byCategoryRaw
      .map((c) => ({ category: categoryById.get(c.categoryId) ?? null, amount: money(Number(c._sum.amount ?? 0)) }))
      .sort((a, b) => Number(b.amount) - Number(a.amount)),
    trend: monthlyRows.map((m) => ({ label: m.month.toISOString().slice(0, 7), value: Number(m.amount) })),
  };
}

/** Merges the three already-computed monthly series (fees collected in,
 * payroll + expenses out) into one aligned trend for a P&L-style chart — one
 * point per month covered by any of the three, income/expense/payroll/net
 * all present even where a given month had zero of one kind. No new
 * queries: this is pure recombination of buildFees/buildPayroll/
 * buildExpenses' own trend arrays. */
function buildFinance(
  fees: Awaited<ReturnType<typeof buildFees>>,
  payroll: Awaited<ReturnType<typeof buildPayroll>>,
  expenses: Awaited<ReturnType<typeof buildExpenses>>
) {
  const months = new Set([
    ...fees.collectedTrend.map((p) => p.label),
    ...payroll.trend.map((p) => p.label),
    ...expenses.trend.map((p) => p.label),
  ]);
  const incomeByMonth = new Map(fees.collectedTrend.map((p) => [p.label, p.value]));
  const payrollByMonth = new Map(payroll.trend.map((p) => [p.label, p.value]));
  const expenseByMonth = new Map(expenses.trend.map((p) => [p.label, p.value]));

  const trend = [...months]
    .sort()
    .map((label) => {
      const income = incomeByMonth.get(label) ?? 0;
      const payrollCost = payrollByMonth.get(label) ?? 0;
      const expenseCost = expenseByMonth.get(label) ?? 0;
      return { label, income, payroll: payrollCost, expenses: expenseCost, net: income - payrollCost - expenseCost };
    });

  return {
    // A same-window cash snapshot alongside the trend — collected fees
    // against the two outflows already computed above, nothing double-counted.
    collected: fees.collectedInRange,
    payrollPaid: payroll.paidInRange,
    expensesPaid: expenses.totalInRange,
    net: money(Number(fees.collectedInRange) - Number(payroll.paidInRange) - Number(expenses.totalInRange)),
    trend,
  };
}

/** Groups a list of dates into ISO-week buckets ("2026-08-24") for a trend
 * chart. All-JS on purpose — these lists are already narrow (a single
 * `admissionDate` column, one row per admission in a 90-day window), so
 * there's no query to push this into. */
function bucketByWeek(dates: Date[]): { label: string; value: number }[] {
  const buckets = new Map<string, number>();
  for (const d of dates) {
    const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dow = day.getUTCDay();
    const monday = new Date(day);
    monday.setUTCDate(day.getUTCDate() - ((dow + 6) % 7));
    const label = monday.toISOString().slice(0, 10);
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value }));
}

// ---------------------------------------------------------------------------
// Student analysis
// ---------------------------------------------------------------------------

const ATTENDANCE_FLAG_THRESHOLD = 75;

analyticsRouter.get("/students", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const { from, to } = resolveRange(req.query);

    const students = await prisma.student.findMany({
      where: { instituteId, isActive: true },
      select: { id: true, name: true, studentCode: true, course: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });
    if (students.length === 0) return res.json({ range: { from, to }, students: [] });

    const studentIds = students.map((s) => s.id);

    // Two queries total for every student's attendance and test figures —
    // never one query per student in this list.
    const [attendanceRows, testRows] = await Promise.all([
      prisma.$queryRaw<{ studentId: string; present: bigint; total: bigint }[]>`
        SELECT ar."studentId",
               count(*) FILTER (WHERE ar."status" IN ('PRESENT', 'PRESENT_BIOMETRIC', 'LATE')) AS present,
               count(*) AS total
        FROM attendance_records ar
        JOIN lectures l ON l."id" = ar."lectureId"
        WHERE l."instituteId" = ${instituteId} AND l."date" >= ${from} AND l."date" <= ${to}
          AND ar."studentId" IN (${Prisma.join(studentIds)})
        GROUP BY ar."studentId"
      `,
      // Scoped by the session's own date, not enteredAt — see the note on
      // the student-detail query below for why.
      prisma.$queryRaw<{ studentId: string; testId: string; marksObtained: number; totalMarks: number; date: Date }[]>`
        SELECT tr."studentId", tr."testId", tr."marksObtained", t."totalMarks", l."date"
        FROM test_results tr
        JOIN tests t ON t."id" = tr."testId"
        JOIN lectures l ON l."id" = tr."lectureId"
        WHERE t."instituteId" = ${instituteId} AND l."date" >= ${from} AND l."date" <= ${to}
          AND tr."studentId" IN (${Prisma.join(studentIds)})
        ORDER BY l."date" ASC
      `,
    ]);

    const attendanceByStudent = new Map(attendanceRows.map((r) => [r.studentId, r]));
    const testsByStudent = new Map<string, typeof testRows>();
    for (const row of testRows) {
      if (!testsByStudent.has(row.studentId)) testsByStudent.set(row.studentId, []);
      testsByStudent.get(row.studentId)!.push(row);
    }

    const result = students.map((s) => {
      const att = attendanceByStudent.get(s.id);
      const attendancePercent = att ? pct(Number(att.present), Number(att.total)) : null;

      const results = testsByStudent.get(s.id) ?? [];
      const avgPercent =
        results.length > 0
          ? Math.round((results.reduce((sum, r) => sum + (r.marksObtained / r.totalMarks) * 100, 0) / results.length) * 10) / 10
          : null;
      // A simple two-point trend (first half vs. second half of the window's
      // attempts) — enough to flag "improving" / "declining" without needing
      // real linear regression for what's ultimately a highlight, not a grade.
      const trendDelta = testTrendDelta(results);

      const flags: string[] = [];
      if (attendancePercent !== null && attendancePercent < ATTENDANCE_FLAG_THRESHOLD) flags.push("LOW_ATTENDANCE");
      if (trendDelta !== null && trendDelta < -10) flags.push("DECLINING_SCORES");

      return {
        student: { id: s.id, name: s.name, studentCode: s.studentCode, course: s.course },
        attendancePercent,
        testAveragePercent: avgPercent,
        testCount: results.length,
        flags,
      };
    });

    res.json({ range: { from, to }, students: result });
  } catch (err) {
    next(err);
  }
});

function testTrendDelta(results: { marksObtained: number; totalMarks: number }[]): number | null {
  if (results.length < 2) return null;
  const mid = Math.floor(results.length / 2);
  const pctOf = (r: { marksObtained: number; totalMarks: number }) => (r.marksObtained / r.totalMarks) * 100;
  const firstHalf = results.slice(0, mid).reduce((sum, r) => sum + pctOf(r), 0) / mid;
  const secondHalf = results.slice(mid).reduce((sum, r) => sum + pctOf(r), 0) / (results.length - mid);
  return Math.round((secondHalf - firstHalf) * 10) / 10;
}

analyticsRouter.get("/students/:id", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const { from, to } = resolveRange(req.query);
    const studentId = req.params.id as string;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, studentCode: true, instituteId: true, course: { select: { id: true, name: true, feeMode: true } } },
    });
    if (!student || student.instituteId !== instituteId) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Student not found" } });
    }

    const isSubjectWise = student.course.feeMode === "SUBJECT_WISE";

    const [weeklyAttendance, bySubjectAttendance, testHistory] = await Promise.all([
      prisma.$queryRaw<{ week: Date; present: bigint; total: bigint }[]>`
        SELECT date_trunc('week', l."date") AS week,
               count(*) FILTER (WHERE ar."status" IN ('PRESENT', 'PRESENT_BIOMETRIC', 'LATE')) AS present,
               count(*) AS total
        FROM attendance_records ar
        JOIN lectures l ON l."id" = ar."lectureId"
        WHERE ar."studentId" = ${studentId} AND l."date" >= ${from} AND l."date" <= ${to}
        GROUP BY week
        ORDER BY week
      `,
      isSubjectWise
        ? prisma.$queryRaw<{ subjectId: string; subjectName: string; present: bigint; total: bigint }[]>`
            SELECT s."id" AS "subjectId", s."name" AS "subjectName",
                   count(*) FILTER (WHERE ar."status" IN ('PRESENT', 'PRESENT_BIOMETRIC', 'LATE')) AS present,
                   count(*) AS total
            FROM attendance_records ar
            JOIN lectures l ON l."id" = ar."lectureId"
            JOIN subjects s ON s."id" = l."subjectId"
            WHERE ar."studentId" = ${studentId} AND l."date" >= ${from} AND l."date" <= ${to}
            GROUP BY s."id", s."name"
          `
        : Promise.resolve([]),
      // Scoped by the session's own date (via the lecture it's tied to), not
      // enteredAt — the same createdAt-vs-actual-date fix as buildTests
      // above: a mark entered today for a June test is a June result.
      prisma.testResult.findMany({
        where: { studentId, test: { instituteId }, lecture: { date: { gte: from, lte: to } } },
        select: {
          marksObtained: true,
          lecture: { select: { date: true } },
          test: { select: { id: true, title: true, totalMarks: true, passingMarks: true, subject: { select: { name: true } } } },
        },
        orderBy: { lecture: { date: "asc" } },
      }),
    ]);

    const overallPresent = weeklyAttendance.reduce((sum, w) => sum + Number(w.present), 0);
    const overallTotal = weeklyAttendance.reduce((sum, w) => sum + Number(w.total), 0);

    res.json({
      student,
      range: { from, to },
      attendance: {
        overallPercent: pct(overallPresent, overallTotal),
        trend: weeklyAttendance.map((w) => ({ label: w.week.toISOString().slice(0, 10), value: pct(Number(w.present), Number(w.total)) })),
        bySubject: bySubjectAttendance.map((s) => ({
          subject: { id: s.subjectId, name: s.subjectName },
          percent: pct(Number(s.present), Number(s.total)),
        })),
      },
      tests: {
        history: testHistory.map((r) => ({
          testId: r.test.id,
          title: r.test.title,
          subject: r.test.subject.name,
          marksObtained: Number(r.marksObtained),
          totalMarks: r.test.totalMarks,
          percent: Math.round((Number(r.marksObtained) / r.test.totalMarks) * 1000) / 10,
          passed: r.test.passingMarks !== null ? Number(r.marksObtained) >= r.test.passingMarks : null,
          date: r.lecture.date,
        })),
        averagePercent:
          testHistory.length > 0
            ? Math.round(
                (testHistory.reduce((sum, r) => sum + (Number(r.marksObtained) / r.test.totalMarks) * 100, 0) / testHistory.length) * 10
              ) / 10
            : null,
      },
    });
  } catch (err) {
    next(err);
  }
});
