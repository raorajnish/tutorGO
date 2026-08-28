import { randomInt } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";
import { money } from "../lib/money.js";
import { nextStudentCode } from "../services/studentCode.js";
import { createDistributionReceiptsForNewStudent } from "../services/distributionSync.js";
import { toCsv } from "../lib/csv.js";

async function isModuleActive(instituteId: string, code: "FEES" | "ATTENDANCE"): Promise<boolean> {
  const sub = await prisma.instituteModule.findFirst({ where: { instituteId, isActive: true, module: { code } } });
  return !!sub;
}

async function loadFeeAccountSummary(studentId: string) {
  const account = await prisma.feeAccount.findUnique({
    where: { studentId },
    include: { installments: true },
  });
  if (!account) return null;

  const totalDue = account.installments.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
  const totalPaid = account.installments.reduce((sum, i) => sum.plus(i.paidAmount), new Prisma.Decimal(0));
  const totalWaived = account.installments.reduce(
    (sum, i) => (i.waived ? sum.plus(i.amount.minus(i.paidAmount)) : sum),
    new Prisma.Decimal(0)
  );
  const balance = totalDue.minus(totalPaid).minus(totalWaived);

  return {
    planType: account.planType,
    status: account.status,
    totalDue: money(totalDue),
    totalPaid: money(totalPaid),
    balance: money(balance),
  };
}

async function loadRecentAttendance(studentId: string) {
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId },
    include: { lecture: { include: { subject: { select: { name: true } }, batch: { select: { name: true } } } } },
    orderBy: { lecture: { date: "desc" } },
    take: 10,
  });
  return records.map((r) => ({
    lectureId: r.lectureId,
    date: r.lecture.date,
    subject: r.lecture.subject.name,
    batch: r.lecture.batch.name,
    status: r.status,
  }));
}

export const studentsRouter = Router();

studentsRouter.use(authenticate, requireInstitute, requireRoles("OWNER", "ADMIN", "RECEPTION"));

studentsRouter.get("/", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "active";
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
    const sort = typeof req.query.sort === "string" ? req.query.sort : "admissionDate_desc";

    const orderBy: Record<string, "asc" | "desc"> =
      sort === "admissionDate_asc"
        ? { admissionDate: "asc" }
        : sort === "name_asc"
          ? { name: "asc" }
          : sort === "name_desc"
            ? { name: "desc" }
            : { admissionDate: "desc" };

    const [students, activeCount, totalCount, activeBatchCount] = await Promise.all([
      prisma.student.findMany({
        where: {
          instituteId,
          isActive: status === "all" ? undefined : status === "inactive" ? false : true,
          courseId,
          batches: batchId ? { some: { batchId, leftAt: null } } : undefined,
          OR: search
            ? [
                { name: { contains: search, mode: "insensitive" } },
                { studentCode: { contains: search, mode: "insensitive" } },
                { phone: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ]
            : undefined,
        },
        include: {
          course: { select: { id: true, name: true, code: true } },
          batches: { where: { leftAt: null }, include: { batch: { select: { id: true, name: true } } } },
          feeAccount: { select: { id: true } },
        },
        orderBy,
      }),
      prisma.student.count({ where: { instituteId, isActive: true } }),
      prisma.student.count({ where: { instituteId } }),
      prisma.batch.count({ where: { instituteId, isActive: true } }),
    ]);

    res.json({
      students: students.map((s) => ({
        id: s.id,
        studentCode: s.studentCode,
        name: s.name,
        email: s.email,
        phone: s.phone,
        course: s.course,
        currentBatch: s.batches[0]?.batch ?? null,
        admissionDate: s.admissionDate,
        isActive: s.isActive,
        hasFeeAccount: s.feeAccount !== null,
        // null = admitted normally (nothing to self-fill); non-null and
        // still null-valued *inside* profileCompletedAt would be a
        // contradiction — this is just "was this row ever bulk-precreated,
        // and if so has the student filled it in yet".
        selfFillPending: s.selfFillEligible && s.profileCompletedAt === null,
        profileCompletedAt: s.profileCompletedAt,
      })),
      stats: {
        activeStudents: activeCount,
        totalStudents: totalCount,
        activeBatches: activeBatchCount,
        feeBookValue: 0, // populated once Fees (Phase 5) exists
      },
    });
  } catch (err) {
    next(err);
  }
});

// Registered ahead of GET /:id deliberately — Express matches routes in
// registration order, and "roster.csv" etc. would otherwise be swallowed as
// an :id value and never reach these handlers.

/** Name + student ID + PIN, scoped to one course/batch — the actual handout
 * sheet. Deliberately never returned by any other endpoint; see
 * bulk-precreate's comment above it. Only rows still awaiting self-fill are
 * included — once a student completes their profile, `selfFillPin` is
 * cleared server-side (see /public/students/complete-profile) and there's
 * nothing meaningful left to print for them. See changes-phase8.md §8f. */
studentsRouter.get("/roster.csv", requireModule("ADMISSION"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
    if (!courseId && !batchId) throw ApiError.badRequest("Provide a courseId or batchId to export");

    const students = await prisma.student.findMany({
      where: {
        instituteId,
        courseId,
        batches: batchId ? { some: { batchId, leftAt: null } } : undefined,
        selfFillEligible: true,
        profileCompletedAt: null,
      },
      orderBy: { name: "asc" },
      select: { name: true, studentCode: true, selfFillPin: true },
    });

    const rows = [["Name", "Student ID", "Self-fill code"], ...students.map((s) => [s.name, s.studentCode, s.selfFillPin ?? ""])];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="admission-roster.csv"`);
    res.send(toCsv(rows));
  } catch (err) {
    next(err);
  }
});

/** Same rows as the CSV, as JSON — backs the print-styled roster page that
 * becomes a PDF via the browser's own Print dialog rather than a server-side
 * PDF library (see changes-phase8.md §8f, Confirmation 4). */
studentsRouter.get("/roster", requireModule("ADMISSION"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
    if (!courseId && !batchId) throw ApiError.badRequest("Provide a courseId or batchId to export");

    const [students, course, batch] = await Promise.all([
      prisma.student.findMany({
        where: {
          instituteId,
          courseId,
          batches: batchId ? { some: { batchId, leftAt: null } } : undefined,
          selfFillEligible: true,
          profileCompletedAt: null,
        },
        orderBy: { name: "asc" },
        select: { name: true, studentCode: true, selfFillPin: true },
      }),
      courseId ? prisma.course.findUnique({ where: { id: courseId }, select: { name: true } }) : null,
      batchId ? prisma.batch.findUnique({ where: { id: batchId }, select: { name: true } }) : null,
    ]);

    res.json({ course: course?.name ?? null, batch: batch?.name ?? null, students });
  } catch (err) {
    next(err);
  }
});

/** Per course/batch counts of filled vs still-pending self-fill profiles —
 * backs the staff status view. */
studentsRouter.get("/self-fill-status", requireModule("ADMISSION"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;

    const students = await prisma.student.findMany({
      where: {
        instituteId,
        courseId,
        batches: batchId ? { some: { batchId, leftAt: null } } : undefined,
        // Includes completed rows too — this is the status view, so it must
        // show filled and pending together, unlike the roster export above
        // (which only ever hands out pending students to print).
        selfFillEligible: true,
      },
      include: { course: { select: { id: true, name: true, code: true } } },
      orderBy: { name: "asc" },
    });

    res.json(
      students.map((s) => ({
        id: s.id,
        name: s.name,
        studentCode: s.studentCode,
        course: s.course,
        profileCompletedAt: s.profileCompletedAt,
        selfFillLocked: s.selfFillLockedAt !== null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

async function loadStudent(id: string, instituteId: string) {
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      course: { select: { id: true, name: true, code: true } },
      batches: {
        include: { batch: { select: { id: true, name: true, course: { select: { id: true, name: true } } } } },
        orderBy: { joinedAt: "desc" },
      },
      enquiry: { select: { id: true, source: true, createdAt: true } },
    },
  });
  if (!student || student.instituteId !== instituteId) throw ApiError.notFound("Student not found");
  return student;
}

studentsRouter.get("/:id", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const student = await loadStudent(req.params.id as string, instituteId);

    const [feesEnabled, attendanceEnabled] = await Promise.all([
      isModuleActive(instituteId, "FEES"),
      isModuleActive(instituteId, "ATTENDANCE"),
    ]);

    res.json({
      id: student.id,
      studentCode: student.studentCode,
      name: student.name,
      email: student.email,
      phone: student.phone,
      parentPhone: student.parentPhone,
      course: student.course,
      dob: student.dob,
      fatherName: student.fatherName,
      motherName: student.motherName,
      school: student.school,
      admissionDate: student.admissionDate,
      fingerprintId: student.fingerprintId,
      isActive: student.isActive,
      // Never the PIN itself here — only ever readable via the roster
      // export, which is the one place printing it is the point.
      profileCompletedAt: student.profileCompletedAt,
      selfFillPending: student.selfFillEligible && student.profileCompletedAt === null,
      selfFillLocked: student.selfFillLockedAt !== null,
      enquiry: student.enquiry,
      batchHistory: student.batches.map((sb) => ({
        id: sb.id,
        batch: sb.batch,
        joinedAt: sb.joinedAt,
        leftAt: sb.leftAt,
      })),
      feesModuleEnabled: feesEnabled,
      feeAccount: feesEnabled ? await loadFeeAccountSummary(student.id) : null,
      attendanceModuleEnabled: attendanceEnabled,
      recentAttendance: attendanceEnabled ? await loadRecentAttendance(student.id) : [],
    });
  } catch (err) {
    next(err);
  }
});

const updateStudentSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  parentPhone: z.string().nullable().optional(),
  dob: z.coerce.date().nullable().optional(),
  fatherName: z.string().nullable().optional(),
  motherName: z.string().nullable().optional(),
  school: z.string().nullable().optional(),
  fingerprintId: z.string().nullable().optional(),
});

studentsRouter.patch("/:id", validateBody(updateStudentSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateStudentSchema>;
    const student = await loadStudent(req.params.id as string, instituteId);

    if (body.email && body.email.toLowerCase() !== student.email) {
      const clash = await prisma.student.findUnique({ where: { email: body.email.toLowerCase() } });
      if (clash) throw ApiError.conflict("A student with this email already exists");
    }

    const updated = await prisma.student.update({
      where: { id: student.id },
      data: { ...body, email: body.email ? body.email.toLowerCase() : undefined },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

studentsRouter.post("/:id/deactivate", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const student = await loadStudent(req.params.id as string, instituteId);

    await prisma.$transaction(async (tx) => {
      await tx.student.update({ where: { id: student.id }, data: { isActive: false } });
      await tx.studentBatch.updateMany({
        where: { studentId: student.id, leftAt: null },
        data: { leftAt: new Date() },
      });
    });

    await auditLog({
      action: "STUDENT_DEACTIVATED",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "Student",
      targetId: student.id,
    });

    res.json({ id: student.id, isActive: false });
  } catch (err) {
    next(err);
  }
});

studentsRouter.post("/:id/activate", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const student = await loadStudent(req.params.id as string, instituteId);
    await prisma.student.update({ where: { id: student.id }, data: { isActive: true } });
    res.json({ id: student.id, isActive: true });
  } catch (err) {
    next(err);
  }
});

const reassignSchema = z.object({ batchId: z.string().min(1, "Batch is required") });

studentsRouter.post(
  "/:id/reassign-batch",
  requireModule("ADMISSION"),
  validateBody(reassignSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof reassignSchema>;
      const student = await loadStudent(req.params.id as string, instituteId);

      const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
      if (!batch || batch.instituteId !== instituteId) throw ApiError.badRequest("Batch not found");
      if (batch.courseId !== student.courseId) {
        throw ApiError.badRequest("Selected batch does not belong to this student's course");
      }

      const today = new Date();

      const created = await prisma.$transaction(async (tx) => {
        await tx.studentBatch.updateMany({
          where: { studentId: student.id, leftAt: null },
          data: { leftAt: today },
        });

        return tx.studentBatch.create({
          data: { studentId: student.id, batchId: batch.id, joinedAt: today },
          include: { batch: { select: { id: true, name: true } } },
        });
      });

      await auditLog({
        action: "STUDENT_BATCH_REASSIGNED",
        instituteId,
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        targetType: "Student",
        targetId: student.id,
        metadata: { batchId: batch.id },
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Self-service admission — bulk pre-create, roster export, staff overrides.
// See changes-phase8.md §8f.
// ---------------------------------------------------------------------------

/** 4-digit numeric, zero-padded ("0007" not "7") — the whole point is a
 * short code a student can type on a phone, so it stays fixed-width and
 * numeric-only rather than reusing any alphanumeric-ID convention. */
function generateSelfFillPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

const bulkPrecreateSchema = z.object({
  courseId: z.string().min(1, "Course is required"),
  batchId: z.string().min(1, "Batch is required"),
  names: z
    .array(z.string().trim().min(1))
    .min(1, "At least one name is required")
    .max(200, "At most 200 students at a time — split larger batches into more than one request"),
});

studentsRouter.post(
  "/bulk-precreate",
  requireModule("ADMISSION"),
  validateBody(bulkPrecreateSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof bulkPrecreateSchema>;
      const instituteId = req.tenantId!;

      const institute = await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } });
      const course = await prisma.course.findUnique({ where: { id: body.courseId } });
      if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");
      const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
      if (!batch || batch.instituteId !== instituteId) throw ApiError.badRequest("Batch not found");
      if (batch.courseId !== body.courseId) throw ApiError.badRequest("Selected batch does not belong to the selected course");

      // "Already attending" is the whole premise of this feature — backdating
      // to today rather than asking staff to pick a date for a class that's
      // demonstrably already running.
      const admissionDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

      const created = await prisma.$transaction(async (tx) => {
        const rows: { id: string; name: string; studentCode: string; selfFillPin: string }[] = [];

        for (const name of body.names) {
          const studentCode = await nextStudentCode(tx, instituteId, institute.code, admissionDate, course.code);
          const email = `${studentCode}@tutorgo.in`.toLowerCase();
          const selfFillPin = generateSelfFillPin();

          const student = await tx.student.create({
            data: {
              instituteId,
              studentCode,
              courseId: body.courseId,
              name,
              email,
              admissionDate,
              selfFillEligible: true,
              profileCompletedAt: null,
              selfFillPin,
            },
          });

          await tx.studentBatch.create({ data: { studentId: student.id, batchId: batch.id, joinedAt: admissionDate } });
          await createDistributionReceiptsForNewStudent(tx, instituteId, student.id, body.courseId);

          rows.push({ id: student.id, name: student.name, studentCode: student.studentCode, selfFillPin });
        }

        return rows;
      });

      await auditLog({
        action: "STUDENTS_BULK_PRECREATED",
        instituteId,
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        targetType: "Batch",
        targetId: batch.id,
        metadata: { courseId: body.courseId, count: created.length },
      });

      // The PIN is returned here (and only here / the roster export below) —
      // never on GET /students or GET /students/:id, matching how a
      // just-generated secret is shown once rather than kept freely readable.
      res.status(201).json({ students: created });
    } catch (err) {
      next(err);
    }
  }
);

/** Lets staff re-open a completed self-fill profile for correction — clears
 * the completion lock so the student can submit again, without touching any
 * of the data they already filled in (that stays until overwritten by the
 * next submission or by staff editing it directly via PATCH /:id).
 *
 * Also generates a FRESH PIN: `complete-profile` clears the old one (there's
 * nothing to protect once a profile is done), so without a new one the
 * student would have no way back in — "reopen" would silently mean
 * "permanently locked out" instead of "try again". Staff must hand the new
 * PIN to the student the same way as the original roster export (returned
 * here, not re-printed automatically). */
studentsRouter.post("/:id/self-fill/reopen", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const student = await loadStudent(req.params.id as string, instituteId);
    if (student.profileCompletedAt === null) throw ApiError.badRequest("This profile hasn't been completed yet");

    // Reopening hands the student a fresh attempt budget too — otherwise a
    // student who got locked out, then had staff fix things up, would find
    // themselves still locked on the very next try.
    const selfFillPin = generateSelfFillPin();
    const updated = await prisma.student.update({
      where: { id: student.id },
      data: { profileCompletedAt: null, selfFillPin, selfFillAttempts: 0, selfFillLockedAt: null },
    });

    await auditLog({
      action: "STUDENT_SELF_FILL_REOPENED",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "Student",
      targetId: student.id,
    });

    res.json({ id: updated.id, profileCompletedAt: updated.profileCompletedAt, selfFillPin });
  } catch (err) {
    next(err);
  }
});

/** Unlocks a record that hit the failed-PIN limit without marking it
 * complete — for the "parent mistyped it 5 times" case, distinct from
 * reopen's "it was already submitted, let them fix a mistake" case. */
studentsRouter.post("/:id/self-fill/reset-lock", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const student = await loadStudent(req.params.id as string, instituteId);
    if (student.selfFillLockedAt === null && student.selfFillAttempts === 0) {
      throw ApiError.badRequest("This profile isn't locked");
    }

    const updated = await prisma.student.update({
      where: { id: student.id },
      data: { selfFillAttempts: 0, selfFillLockedAt: null },
    });

    await auditLog({
      action: "STUDENT_SELF_FILL_LOCK_RESET",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "Student",
      targetId: student.id,
    });

    res.json({ id: updated.id, selfFillLocked: false });
  } catch (err) {
    next(err);
  }
});
