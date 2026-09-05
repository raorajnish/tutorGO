import { randomInt } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { parse as parseCsv } from "csv-parse/sync";
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
import { todayDateOnly } from "../lib/dateOnly.js";

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

/** The real student directory export — NOT the same thing as roster.csv
 * below, which is a narrow self-fill-PIN handout sheet for a different
 * purpose. Mirrors GET /'s filters (search/status/courseId/batchId) so the
 * export matches whatever's currently on screen. OWNER/ADMIN only — see
 * changes-phase10.md §10.5; RECEPTION can use the on-screen directory but
 * not bulk-export contact details. */
studentsRouter.get("/export.csv", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "active";
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;

    const students = await prisma.student.findMany({
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
        course: { select: { name: true } },
        batches: { where: { leftAt: null }, include: { batch: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    });

    const rows = [
      ["Name", "Student Code", "Course", "Batch", "Phone", "Parent Phone", "Email", "Status", "Admission Date"],
      ...students.map((s) => [
        s.name,
        s.studentCode,
        s.course.name,
        s.batches[0]?.batch.name ?? "",
        s.phone ?? "",
        s.parentPhone ?? "",
        s.email,
        s.isActive ? "Active" : "Inactive",
        s.admissionDate.toISOString().slice(0, 10),
      ]),
    ];

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="students.csv"`);
    res.send(toCsv(rows));
  } catch (err) {
    next(err);
  }
});

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

const enableSelfFillSchema = z.object({
  courseId: z.string().min(1, "Course is required"),
  batchId: z.string().min(1, "Batch is required"),
});

/** For students admitted the normal way (via AdmitModal) with incomplete
 * details, rather than the brand-new-student path above — retrofits
 * self-fill onto their existing row instead of creating a duplicate.
 * Idempotent: students already selfFillEligible are left untouched so a
 * re-run over the same batch doesn't burn a fresh PIN on someone who
 * already has (or already used) one. */
studentsRouter.post(
  "/self-fill/enable",
  requireModule("ADMISSION"),
  validateBody(enableSelfFillSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof enableSelfFillSchema>;
      const instituteId = req.tenantId!;

      const course = await prisma.course.findUnique({ where: { id: body.courseId } });
      if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");
      const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
      if (!batch || batch.instituteId !== instituteId) throw ApiError.badRequest("Batch not found");
      if (batch.courseId !== body.courseId) throw ApiError.badRequest("Selected batch does not belong to the selected course");

      const batchScope = {
        instituteId,
        courseId: body.courseId,
        isActive: true,
        batches: { some: { batchId: body.batchId, leftAt: null } },
      } as const;

      const [candidates, alreadyEnabledCount] = await Promise.all([
        prisma.student.findMany({
          where: { ...batchScope, selfFillEligible: false },
          select: { id: true, name: true, studentCode: true },
        }),
        prisma.student.count({ where: { ...batchScope, selfFillEligible: true } }),
      ]);

      const enabled = await prisma.$transaction(
        candidates.map((s) =>
          prisma.student.update({
            where: { id: s.id },
            data: { selfFillEligible: true, selfFillPin: generateSelfFillPin(), selfFillAttempts: 0, selfFillLockedAt: null },
            select: { id: true, name: true, studentCode: true, selfFillPin: true },
          })
        )
      );

      if (enabled.length > 0) {
        await auditLog({
          action: "STUDENTS_SELF_FILL_ENABLED",
          instituteId,
          organizationId: req.user!.organizationId,
          userId: req.user!.id,
          targetType: "Batch",
          targetId: batch.id,
          metadata: { courseId: body.courseId, count: enabled.length },
        });
      }

      res.status(201).json({
        students: enabled.map((s) => ({ id: s.id, name: s.name, studentCode: s.studentCode, selfFillPin: s.selfFillPin! })),
        alreadyEnabledCount,
      });
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

// ---------------------------------------------------------------------------
// Subject enrollment (SUBJECT_WISE courses) — see changes-phase8.md §8c
// ---------------------------------------------------------------------------

function serializeStudentSubject(s: {
  id: string;
  amount: Prisma.Decimal;
  isActive: boolean;
  joinedAt: Date;
  leftAt: Date | null;
  subject: { id: string; name: string; shortCode: string };
}) {
  return {
    id: s.id,
    subjectId: s.subject.id,
    subjectName: s.subject.name,
    subjectShortCode: s.subject.shortCode,
    amount: money(s.amount),
    isActive: s.isActive,
    joinedAt: s.joinedAt,
    leftAt: s.leftAt,
  };
}

studentsRouter.get("/:id/subjects", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const student = await loadStudent(req.params.id as string, instituteId);

    const rows = await prisma.studentSubject.findMany({
      where: { studentId: student.id },
      include: { subject: { select: { id: true, name: true, shortCode: true } } },
      orderBy: { subject: { name: "asc" } },
    });

    res.json(rows.map(serializeStudentSubject));
  } catch (err) {
    next(err);
  }
});

const setSubjectActiveSchema = z.object({ isActive: z.boolean() });

/// Dropping or resuming a subject mid-course. This is an *enrollment* action
/// and touches the roster only — it deliberately never adjusts an installment.
/// Whether a family gets money back for a dropped subject is a policy call that
/// varies by institute and even by negotiation, so it stays an explicit,
/// deliberate act via the existing fee-correction tools rather than a silent
/// side-effect here that could under- or over-charge someone.
///
/// Distinct from correcting a wrong selection (PATCH /fees/accounts/:id/pricing),
/// which does reprice — because there the enrollment was never right in the
/// first place. Keeping them as separate actions is the point: sharing one
/// control would eventually wipe a real outstanding balance.
studentsRouter.patch("/:id/subjects/:subjectId", validateBody(setSubjectActiveSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof setSubjectActiveSchema>;
    const student = await loadStudent(req.params.id as string, instituteId);

    const row = await prisma.studentSubject.findUnique({
      where: { studentId_subjectId: { studentId: student.id, subjectId: req.params.subjectId as string } },
    });
    if (!row) throw ApiError.notFound("This student isn't enrolled in that subject");
    if (row.isActive === body.isActive) {
      throw ApiError.badRequest(body.isActive ? "That subject is already active" : "That subject is already dropped");
    }

    // leftAt is what deriveRoster actually filters on, so it must move in step
    // with isActive — set on a drop so past rosters keep the student, cleared
    // on a resume so future ones get them back.
    const updated = await prisma.studentSubject.update({
      where: { id: row.id },
      data: { isActive: body.isActive, leftAt: body.isActive ? null : todayDateOnly() },
      include: { subject: { select: { id: true, name: true, shortCode: true } } },
    });

    await auditLog({
      action: body.isActive ? "STUDENT_SUBJECT_RESUMED" : "STUDENT_SUBJECT_DROPPED",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "Student",
      targetId: student.id,
      metadata: { subjectId: updated.subjectId },
    });

    res.json(serializeStudentSubject(updated));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Bulk CSV import — see changes-phase12.md §12.1. Validate-then-commit: every
// row is checked (and course/batch/duplicate-email resolved) before any
// database write happens, so a file with 195 good rows and 5 bad ones never
// partially applies — the report always accounts for all 200 outcomes from
// one pass. Same creation shape as POST /admission (admission.ts), minus
// enquiry conversion, which only makes sense for one-at-a-time admits.
// ---------------------------------------------------------------------------

const IMPORT_MAX_ROWS = 2000;
const IMPORT_MAX_BYTES = 2 * 1024 * 1024; // a 2,000-row CSV is nowhere near this
const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMPORT_MAX_BYTES } });

const STUDENT_IMPORT_COLUMNS = [
  "name",
  "email",
  "phone",
  "parentPhone",
  "courseCode",
  "batchName",
  "dob",
  "fatherName",
  "motherName",
  "school",
  "admissionDate",
  "fingerprintId",
] as const;

const studentImportRowSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().pipe(z.union([z.literal(""), z.string().email("Invalid email")])),
  phone: z.string().trim().min(1, "Phone is required"),
  parentPhone: z.string().trim().optional().default(""),
  courseCode: z.string().trim().min(1, "Course code is required"),
  batchName: z.string().trim().min(1, "Batch name is required"),
  dob: z.string().trim().optional().default(""),
  fatherName: z.string().trim().optional().default(""),
  motherName: z.string().trim().optional().default(""),
  school: z.string().trim().optional().default(""),
  admissionDate: z.string().trim().optional().default(""),
  fingerprintId: z.string().trim().optional().default(""),
});

interface ImportRowResult {
  line: number;
  status: "CREATED" | "SKIPPED" | "ERROR";
  name?: string;
  reason?: string;
  studentCode?: string;
}

/** Parses a `date` (or blank) form field into a UTC date-only `Date`. Returns
 * `undefined` for blank, `null` for unparseable — callers distinguish the two
 * so "field omitted" and "field can't be read" get different row outcomes. */
function parseDateOnlyField(value: string): Date | null | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseImportCsv(buffer: Buffer): Record<string, string>[] {
  let records: Record<string, string>[];
  try {
    records = parseCsv(buffer, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch {
    throw ApiError.badRequest("Could not parse this file — make sure it's a valid CSV with a header row.");
  }
  if (records.length === 0) throw ApiError.badRequest("This file has no data rows.");
  if (records.length > IMPORT_MAX_ROWS) {
    throw ApiError.badRequest(
      `This file has ${records.length} rows — the limit per import is ${IMPORT_MAX_ROWS}. Split it into smaller batches.`
    );
  }
  return records;
}

studentsRouter.get("/import/template.csv", requireModule("ADMISSION"), (req, res) => {
  const csv = toCsv([
    [...STUDENT_IMPORT_COLUMNS],
    [
      "Asha Verma",
      "asha.verma@example.com",
      "9876543210",
      "9876500000",
      "JEE25",
      "Batch A",
      "2008-04-12",
      "Ramesh Verma",
      "Sunita Verma",
      "Delhi Public School",
      "2026-06-01",
      "",
    ],
  ]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="student-import-template.csv"');
  res.send(csv);
});

studentsRouter.post(
  "/import",
  requireModule("ADMISSION"),
  importUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) throw ApiError.badRequest("No file was uploaded.");
      const instituteId = req.tenantId!;
      const institute = await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } });

      const records = parseImportCsv(req.file.buffer);

      // Preloaded once, not per row — a 2,000-row file for one institute
      // realistically touches a handful of courses/batches, not thousands.
      const [courses, batches] = await Promise.all([
        prisma.course.findMany({ where: { instituteId }, select: { id: true, code: true } }),
        prisma.batch.findMany({ where: { instituteId }, select: { id: true, name: true, courseId: true } }),
      ]);
      const courseByCode = new Map(courses.map((c) => [c.code.trim().toLowerCase(), c]));
      const batchByKey = new Map(batches.map((b) => [`${b.courseId}::${b.name.trim().toLowerCase()}`, b]));

      type PendingRow = {
        line: number;
        row: z.infer<typeof studentImportRowSchema>;
        courseId: string;
        courseCode: string;
        batchId: string;
        admissionDate: Date;
        dob: Date | undefined;
      };
      const pending: PendingRow[] = [];
      const results: ImportRowResult[] = [];
      const today = todayDateOnly();

      for (let i = 0; i < records.length; i++) {
        const line = i + 2; // header is line 1, data starts at line 2
        const raw = records[i]!;
        const parsed = studentImportRowSchema.safeParse(raw);
        if (!parsed.success) {
          results.push({ line, status: "ERROR", name: raw.name, reason: parsed.error.issues[0]?.message ?? "Invalid row" });
          continue;
        }
        const row = parsed.data;

        const course = courseByCode.get(row.courseCode.toLowerCase());
        if (!course) {
          results.push({ line, status: "ERROR", name: row.name, reason: `Course code "${row.courseCode}" not found` });
          continue;
        }
        const batch = batchByKey.get(`${course.id}::${row.batchName.toLowerCase()}`);
        if (!batch) {
          results.push({ line, status: "ERROR", name: row.name, reason: `Batch "${row.batchName}" not found on course "${row.courseCode}"` });
          continue;
        }

        const dob = parseDateOnlyField(row.dob);
        if (dob === null) {
          results.push({ line, status: "ERROR", name: row.name, reason: `Could not read date of birth "${row.dob}"` });
          continue;
        }
        const admissionDateParsed = parseDateOnlyField(row.admissionDate);
        if (admissionDateParsed === null) {
          results.push({ line, status: "ERROR", name: row.name, reason: `Could not read admission date "${row.admissionDate}"` });
          continue;
        }

        pending.push({
          line,
          row,
          courseId: course.id,
          courseCode: course.code,
          batchId: batch.id,
          admissionDate: admissionDateParsed ?? today,
          dob,
        });
      }

      // Duplicate check, batched in one query rather than per row — and
      // against rows already seen earlier in this same file, since a
      // re-uploaded (partially fixed) CSV must not create the first 195 rows
      // twice. Rows with an explicit email dedupe on it directly. Rows with
      // no email get a fresh, guaranteed-unique {studentCode}@tutorgo.in
      // address at creation time — which is exactly why email can't be the
      // key for them: it's different on every single run. (courseId, phone)
      // is the fallback key instead, since phone is required on every row
      // and stable per student — caught by re-uploading the same file twice
      // during verification, which recreated a blank-email row as a genuine
      // duplicate before this fallback existed.
      const explicitEmails = pending.filter((p) => p.row.email !== "").map((p) => p.row.email);
      const blankEmailRows = pending.filter((p) => p.row.email === "");
      const [existingByEmail, existingByPhone] = await Promise.all([
        explicitEmails.length
          ? prisma.student.findMany({ where: { email: { in: explicitEmails } }, select: { email: true } })
          : Promise.resolve([]),
        blankEmailRows.length
          ? prisma.student.findMany({
              where: { OR: blankEmailRows.map((p) => ({ courseId: p.courseId, phone: p.row.phone })) },
              select: { courseId: true, phone: true },
            })
          : Promise.resolve([]),
      ]);
      const existingEmails = new Set(existingByEmail.map((s) => s.email.toLowerCase()));
      const existingPhoneKeys = new Set(existingByPhone.map((s) => `${s.courseId}::${s.phone}`));

      const seenEmails = new Set<string>();
      const seenPhoneKeys = new Set<string>();
      const toCreate: PendingRow[] = [];
      for (const p of pending) {
        if (p.row.email !== "") {
          if (existingEmails.has(p.row.email) || seenEmails.has(p.row.email)) {
            results.push({ line: p.line, status: "SKIPPED", name: p.row.name, reason: "A student with this email already exists" });
            continue;
          }
          seenEmails.add(p.row.email);
        } else {
          const phoneKey = `${p.courseId}::${p.row.phone}`;
          if (existingPhoneKeys.has(phoneKey) || seenPhoneKeys.has(phoneKey)) {
            results.push({
              line: p.line,
              status: "SKIPPED",
              name: p.row.name,
              reason: "A student with this phone number already exists on this course",
            });
            continue;
          }
          seenPhoneKeys.add(phoneKey);
        }
        toCreate.push(p);
      }

      // Preview mode — the frontend calls this first with everything above
      // already run (course/batch resolution, duplicate detection) and shows
      // it to staff before anything is written. Rows that would succeed are
      // reported as "CREATED" here too (there's no separate "will create"
      // status) since nothing has actually happened yet either way — the
      // response as a whole is what tells the caller this was a preview.
      if (req.body?.dryRun === "true") {
        for (const p of toCreate) {
          results.push({ line: p.line, status: "CREATED", name: p.row.name });
        }
        results.sort((a, b) => a.line - b.line);
        res.json({
          dryRun: true,
          created: toCreate.length,
          skipped: results.filter((r) => r.status === "SKIPPED").length,
          errors: results.filter((r) => r.status === "ERROR").length,
          rows: results,
        });
        return;
      }

      // A large batch is one confirmation step, not 2,000 — the default
      // interactive-transaction timeout would cut this off well before a
      // full 2,000-row file finishes, so it's raised explicitly here rather
      // than relying on the client-wide default used by small transactions
      // elsewhere in this file.
      const created = await prisma.$transaction(
        async (tx) => {
          const rows: { line: number; name: string; studentCode: string }[] = [];
          for (const p of toCreate) {
            try {
              const studentCode = await nextStudentCode(tx, instituteId, institute.code, p.admissionDate, p.courseCode);
              const email = p.row.email !== "" ? p.row.email : `${studentCode}@tutorgo.in`.toLowerCase();

              const student = await tx.student.create({
                data: {
                  instituteId,
                  studentCode,
                  courseId: p.courseId,
                  name: p.row.name,
                  email,
                  phone: p.row.phone,
                  parentPhone: p.row.parentPhone || undefined,
                  dob: p.dob,
                  fatherName: p.row.fatherName || undefined,
                  motherName: p.row.motherName || undefined,
                  school: p.row.school || undefined,
                  admissionDate: p.admissionDate,
                  fingerprintId: p.row.fingerprintId || undefined,
                },
              });
              await tx.studentBatch.create({ data: { studentId: student.id, batchId: p.batchId, joinedAt: p.admissionDate } });
              await createDistributionReceiptsForNewStudent(tx, instituteId, student.id, p.courseId);

              rows.push({ line: p.line, name: student.name, studentCode: student.studentCode });
            } catch (err) {
              // One row's failure (e.g. a race on a uniqueness constraint) must
              // not roll back every other already-committed row in this batch.
              results.push({
                line: p.line,
                status: "ERROR",
                name: p.row.name,
                reason: err instanceof ApiError ? err.message : "Could not create this student",
              });
            }
          }
          return rows;
        },
        { maxWait: 10_000, timeout: 120_000 }
      );

      for (const c of created) {
        results.push({ line: c.line, status: "CREATED", name: c.name, studentCode: c.studentCode });
      }
      results.sort((a, b) => a.line - b.line);

      if (created.length > 0) {
        await auditLog({
          action: "STUDENTS_BULK_IMPORTED",
          instituteId,
          organizationId: req.user!.organizationId,
          userId: req.user!.id,
          targetType: "Institute",
          targetId: instituteId,
          metadata: { count: created.length, totalRows: records.length },
        });
      }

      res.status(201).json({
        dryRun: false,
        created: created.length,
        skipped: results.filter((r) => r.status === "SKIPPED").length,
        errors: results.filter((r) => r.status === "ERROR").length,
        rows: results,
      });
    } catch (err) {
      next(err);
    }
  }
);
