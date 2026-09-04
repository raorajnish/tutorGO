import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireStudent } from "../middleware/auth.js";
import { money } from "../lib/money.js";
import { todayDateOnly } from "../lib/dateOnly.js";
import { toTimeString } from "../lib/lectureShared.js";
import { validateBody } from "../middleware/validate.js";

/**
 * The student's own read-only view of their record (changes-phase10.md §10.6).
 *
 * Every handler scopes to `req.user!.studentId`, which is stamped by
 * `authenticate` from the login's own linked Student row — never from a path
 * or query parameter. That is what makes it structurally impossible for one
 * student to read another's marks or fees: there is no id to tamper with.
 *
 * `authenticate` has also already re-derived portal eligibility by the time
 * any of this runs, so a course whose portal was switched off stops serving
 * data immediately, without any check needing to be repeated here.
 */
export const portalRouter = Router();

portalRouter.use(authenticate, requireStudent);

/** The batch the student is currently in — the scope for timetable and for
 * "tests coming up". Null if they've been admitted but not placed yet, which
 * the UI shows as an empty timetable rather than an error. */
async function currentBatchId(studentId: string): Promise<string | null> {
  const membership = await prisma.studentBatch.findFirst({
    where: { studentId, leftAt: null },
    select: { batchId: true },
    orderBy: { joinedAt: "desc" },
  });
  return membership?.batchId ?? null;
}

/** Attendance rate over every record the student has, plus the raw counts the
 * portal shows underneath it. HOLIDAY is excluded from the denominator — it
 * isn't a day anyone could have attended, so counting it would quietly drag
 * every student's rate down. LATE counts as present, matching how the staff
 * attendance summary already treats it. */
function attendanceStats(records: { status: string }[]) {
  const counted = records.filter((r) => r.status !== "HOLIDAY");
  const present = counted.filter(
    (r) => r.status === "PRESENT" || r.status === "PRESENT_BIOMETRIC" || r.status === "LATE"
  ).length;
  return {
    total: counted.length,
    present,
    absent: counted.filter((r) => r.status === "ABSENT").length,
    leave: counted.filter((r) => r.status === "LEAVE").length,
    rate: counted.length === 0 ? null : Math.round((present / counted.length) * 100),
  };
}

async function feeSummary(studentId: string) {
  const account = await prisma.feeAccount.findUnique({
    where: { studentId },
    include: { installments: { orderBy: { seq: "asc" } } },
  });
  if (!account) return null;

  const zero = new Prisma.Decimal(0);
  const totalDue = account.installments.reduce((s, i) => s.plus(i.amount), zero);
  const totalPaid = account.installments.reduce((s, i) => s.plus(i.paidAmount), zero);
  const totalWaived = account.installments.reduce(
    (s, i) => (i.waived ? s.plus(i.amount.minus(i.paidAmount)) : s),
    zero
  );
  const balance = totalDue.minus(totalPaid).minus(totalWaived);

  const today = todayDateOnly();
  // Installment status is derived here exactly as it is on the staff side —
  // there is no stored status column to read, and inventing a second rule for
  // the portal is how a student ends up being told they're paid up while the
  // defaulters list says otherwise.
  const installments = account.installments.map((i) => {
    const outstanding = i.amount.minus(i.paidAmount);
    const status = i.waived
      ? "WAIVED"
      : outstanding.lessThanOrEqualTo(0)
        ? "PAID"
        : i.dueDate < today
          ? "OVERDUE"
          : i.paidAmount.greaterThan(0)
            ? "PARTIAL"
            : "DUE";
    return {
      id: i.id,
      seq: i.seq,
      dueDate: i.dueDate,
      amount: money(i.amount),
      paidAmount: money(i.paidAmount),
      outstanding: money(outstanding.lessThan(0) ? zero : outstanding),
      status,
    };
  });

  const nextDue = installments.find((i) => i.status === "OVERDUE" || i.status === "DUE" || i.status === "PARTIAL");

  return {
    account,
    summary: {
      planType: account.planType,
      status: account.status,
      totalDue: money(totalDue),
      totalPaid: money(totalPaid),
      balance: money(balance.lessThan(0) ? zero : balance),
      nextDueDate: nextDue?.dueDate ?? null,
      nextDueAmount: nextDue?.outstanding ?? null,
      overdueCount: installments.filter((i) => i.status === "OVERDUE").length,
    },
    installments,
  };
}

// ---------------------------------------------------------------------------
// Dashboard — one round trip for the landing screen
// ---------------------------------------------------------------------------

portalRouter.get("/dashboard", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;
    const batchId = await currentBatchId(studentId);
    const today = todayDateOnly();

    const [student, attendance, upcoming, latestResults, fees, unreadCount] = await Promise.all([
      prisma.student.findUniqueOrThrow({
        where: { id: studentId },
        select: {
          name: true,
          studentCode: true,
          email: true,
          admissionDate: true,
          course: { select: { name: true, code: true } },
          institute: { select: { name: true } },
        },
      }),
      prisma.attendanceRecord.findMany({ where: { studentId }, select: { status: true } }),
      batchId
        ? prisma.lecture.findMany({
            where: { batchId, date: { gte: today }, cancelledAt: null },
            select: {
              id: true,
              kind: true,
              date: true,
              startTime: true,
              endTime: true,
              subject: { select: { name: true } },
              faculty: { select: { fullName: true } },
              test: { select: { id: true, title: true, totalMarks: true } },
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
            take: 3,
          })
        : Promise.resolve([]),
      prisma.testResult.findMany({
        where: { studentId },
        select: {
          id: true,
          marksObtained: true,
          enteredAt: true,
          test: { select: { title: true, totalMarks: true, subject: { select: { name: true } } } },
        },
        orderBy: { enteredAt: "desc" },
        take: 3,
      }),
      feeSummary(studentId),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);

    res.json({
      student: {
        name: student.name,
        studentCode: student.studentCode,
        email: student.email,
        course: student.course,
        instituteName: student.institute.name,
        admissionDate: student.admissionDate,
      },
      attendance: attendanceStats(attendance),
      upcoming: upcoming.map((l) => ({
        id: l.id,
        kind: l.kind,
        date: l.date,
        startTime: toTimeString(l.startTime),
        endTime: toTimeString(l.endTime),
        subject: l.subject.name,
        faculty: l.faculty.fullName,
        test: l.test,
      })),
      recentResults: latestResults.map((r) => ({
        id: r.id,
        title: r.test.title,
        subject: r.test.subject.name,
        marksObtained: money(r.marksObtained),
        totalMarks: r.test.totalMarks,
        enteredAt: r.enteredAt,
      })),
      fees: fees?.summary ?? null,
      unreadNotifications: unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

portalRouter.get("/timetable", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;
    const batchId = await currentBatchId(studentId);
    if (!batchId) return res.json({ batch: null, lectures: [] });

    // A four-week window centred on today: enough past for "what did I miss?"
    // and enough future for "what's coming", without paging a whole year of
    // lectures into a phone.
    const today = todayDateOnly();
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 14);
    const to = new Date(today);
    to.setUTCDate(to.getUTCDate() + 21);

    const [batch, lectures] = await Promise.all([
      prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, name: true } }),
      prisma.lecture.findMany({
        where: { batchId, date: { gte: from, lte: to } },
        select: {
          id: true,
          kind: true,
          date: true,
          startTime: true,
          endTime: true,
          cancelledAt: true,
          cancelReason: true,
          note: true,
          subject: { select: { name: true } },
          faculty: { select: { fullName: true } },
          test: { select: { id: true, title: true, totalMarks: true } },
          // The student's own attendance for that session, if it's been
          // marked — one join rather than a second endpoint the timetable
          // screen would otherwise have to call and stitch together itself.
          attendance: { where: { studentId }, select: { status: true }, take: 1 },
        },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);

    res.json({
      batch,
      lectures: lectures.map((l) => ({
        id: l.id,
        kind: l.kind,
        date: l.date,
        startTime: toTimeString(l.startTime),
        endTime: toTimeString(l.endTime),
        cancelled: l.cancelledAt !== null,
        cancelReason: l.cancelReason,
        note: l.note,
        subject: l.subject.name,
        faculty: l.faculty.fullName,
        test: l.test,
        attendanceStatus: l.attendance[0]?.status ?? null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Tests — their own marks, plus what's scheduled and not yet held
// ---------------------------------------------------------------------------

portalRouter.get("/tests", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;
    const batchId = await currentBatchId(studentId);
    const today = todayDateOnly();

    const [results, upcoming] = await Promise.all([
      prisma.testResult.findMany({
        where: { studentId },
        select: {
          id: true,
          marksObtained: true,
          remarks: true,
          enteredAt: true,
          lecture: { select: { date: true } },
          test: {
            select: {
              id: true,
              title: true,
              totalMarks: true,
              passingMarks: true,
              instructions: true,
              paperAssetUrl: true,
              paperAssetName: true,
              subject: { select: { name: true } },
            },
          },
        },
        orderBy: { enteredAt: "desc" },
      }),
      batchId
        ? prisma.lecture.findMany({
            where: {
              batchId,
              kind: "TEST",
              cancelledAt: null,
              date: { gte: today },
              // A test session the student already has marks for isn't
              // upcoming, whatever its date says.
              results: { none: { studentId } },
            },
            select: {
              id: true,
              date: true,
              startTime: true,
              endTime: true,
              test: {
                select: {
                  id: true,
                  title: true,
                  totalMarks: true,
                  passingMarks: true,
                  instructions: true,
                  paperAssetUrl: true,
                  paperAssetName: true,
                  subject: { select: { name: true } },
                },
              },
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
          })
        : Promise.resolve([]),
    ]);

    res.json({
      upcoming: upcoming
        .filter((l) => l.test !== null)
        .map((l) => ({
          lectureId: l.id,
          date: l.date,
          startTime: toTimeString(l.startTime),
          endTime: toTimeString(l.endTime),
          test: {
            ...l.test!,
            subject: l.test!.subject.name,
          },
        })),
      results: results.map((r) => ({
        id: r.id,
        heldOn: r.lecture.date,
        enteredAt: r.enteredAt,
        marksObtained: money(r.marksObtained),
        remarks: r.remarks,
        test: {
          id: r.test.id,
          title: r.test.title,
          subject: r.test.subject.name,
          totalMarks: r.test.totalMarks,
          passingMarks: r.test.passingMarks,
          instructions: r.test.instructions,
          paperAssetUrl: r.test.paperAssetUrl,
          paperAssetName: r.test.paperAssetName,
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

portalRouter.get("/attendance", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;

    const records = await prisma.attendanceRecord.findMany({
      where: { studentId },
      select: {
        id: true,
        status: true,
        markedAt: true,
        lecture: {
          select: {
            id: true,
            date: true,
            startTime: true,
            kind: true,
            subject: { select: { name: true } },
            batch: { select: { name: true } },
          },
        },
      },
      orderBy: [{ lecture: { date: "desc" } }],
      // Deliberately capped: a student's full history can run into hundreds of
      // rows and the screen shows a rolling record, not an archive. The stats
      // below are computed from every record, not just this page.
      take: 120,
    });

    const all = await prisma.attendanceRecord.findMany({ where: { studentId }, select: { status: true } });

    res.json({
      stats: attendanceStats(all),
      records: records.map((r) => ({
        id: r.id,
        status: r.status,
        date: r.lecture.date,
        startTime: toTimeString(r.lecture.startTime),
        kind: r.lecture.kind,
        subject: r.lecture.subject.name,
        batch: r.lecture.batch.name,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

portalRouter.get("/fees", async (req, res, next) => {
  try {
    const studentId = req.user!.studentId!;
    const fees = await feeSummary(studentId);
    if (!fees) return res.json({ summary: null, installments: [], payments: [] });

    const payments = await prisma.payment.findMany({
      where: { feeAccountId: fees.account.id, voidedAt: null },
      select: {
        id: true,
        amount: true,
        mode: true,
        paidOn: true,
        receiptNumber: true,
        publicToken: true,
        publicTokenRevokedAt: true,
      },
      orderBy: { paidOn: "desc" },
    });

    res.json({
      summary: fees.summary,
      installments: fees.installments,
      payments: payments.map((p) => ({
        id: p.id,
        amount: money(p.amount),
        mode: p.mode,
        paidOn: p.paidOn,
        receiptNumber: p.receiptNumber,
        // The public receipt link the student can open, print or forward —
        // omitted entirely when revoked, so the portal never renders a link
        // that would 404.
        receiptToken: p.publicTokenRevokedAt === null ? p.publicToken : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Notifications — the reminders feed
// ---------------------------------------------------------------------------

portalRouter.get("/notifications", async (req, res, next) => {
  try {
    const [notifications, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, type: true, title: true, body: true, metadata: true, readAt: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);

    res.json({ notifications, unread });
  } catch (err) {
    next(err);
  }
});

const markReadSchema = z.object({ ids: z.array(z.string()).optional() });

/** Marks the given notifications read, or all of them when no ids are given.
 * Scoped to the caller's own userId, so passing someone else's id is a no-op
 * rather than a leak. */
portalRouter.post("/notifications/read", validateBody(markReadSchema), async (req, res, next) => {
  try {
    const { ids } = req.body as z.infer<typeof markReadSchema>;
    const result = await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null, id: ids && ids.length > 0 ? { in: ids } : undefined },
      data: { readAt: new Date() },
    });
    res.json({ marked: result.count });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

portalRouter.get("/profile", async (req, res, next) => {
  try {
    const student = await prisma.student.findUnique({
      where: { id: req.user!.studentId! },
      select: {
        name: true,
        studentCode: true,
        email: true,
        phone: true,
        parentPhone: true,
        dob: true,
        fatherName: true,
        motherName: true,
        school: true,
        admissionDate: true,
        course: { select: { name: true, code: true } },
        institute: { select: { name: true, phone: true, email: true, city: true } },
        batches: {
          where: { leftAt: null },
          select: { joinedAt: true, batch: { select: { name: true } } },
          orderBy: { joinedAt: "desc" },
          take: 1,
        },
      },
    });
    if (!student) throw ApiError.notFound("Student not found");

    res.json({
      ...student,
      currentBatch: student.batches[0]?.batch ?? null,
      batches: undefined,
    });
  } catch (err) {
    next(err);
  }
});
