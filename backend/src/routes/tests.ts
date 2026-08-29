import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { money } from "../lib/money.js";
import {
  PRESENT_STATUSES,
  assertCanActOnLecture,
  deriveRoster,
  lectureInclude,
  serializeLecture,
  timeSchema,
  toTimeDate,
} from "../lib/lectureShared.js";
import { checkSessionConflict, type ConflictSplit } from "../services/lectureConflicts.js";
import { MAX_UPLOAD_BYTES, uploadTestPaper } from "../services/uploads.js";

export const testsRouter = Router();

// Tests are the same lecture/attendance machinery with kind = TEST, so they
// live under the ATTENDANCE module gate rather than introducing a new one.
testsRouter.use(authenticate, requireInstitute, requireModule("ATTENDANCE"));

/// Scheduling a test is an academic decision, not routine desk work — unlike
/// a lecture, RECEPTION can't create one.
const MANAGE_ROLES = ["OWNER", "ADMIN", "FACULTY"] as const;
/// Who may be put down as an invigilator. Deliberately wider than "who may
/// teach" — an admin or the owner routinely covers an exam slot.
const INVIGILATOR_ROLES = ["OWNER", "ADMIN", "FACULTY"] as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const testInclude = {
  course: { select: { id: true, name: true, code: true } },
  subject: { select: { id: true, name: true, shortCode: true } },
} as const;

function serializeTest(t: {
  id: string;
  title: string;
  totalMarks: number;
  passingMarks: number | null;
  instructions: string | null;
  paperAssetUrl: string | null;
  paperAssetType: string | null;
  paperAssetName: string | null;
  createdAt: Date;
  course: { id: string; name: string; code: string };
  subject: { id: string; name: string; shortCode: string };
}) {
  return {
    id: t.id,
    title: t.title,
    totalMarks: t.totalMarks,
    passingMarks: t.passingMarks,
    instructions: t.instructions,
    paperAssetUrl: t.paperAssetUrl,
    paperAssetType: t.paperAssetType,
    paperAssetName: t.paperAssetName,
    createdAt: t.createdAt,
    course: t.course,
    subject: t.subject,
  };
}

async function loadTest(id: string, instituteId: string) {
  const test = await prisma.test.findUnique({ where: { id }, include: testInclude });
  if (!test || test.instituteId !== instituteId) throw ApiError.notFound("Test not found");
  return test;
}

async function loadSession(testId: string, lectureId: string, instituteId: string) {
  const session = await prisma.lecture.findUnique({ where: { id: lectureId }, include: lectureInclude });
  if (!session || session.instituteId !== instituteId || session.testId !== testId) {
    throw ApiError.notFound("Test session not found");
  }
  return session;
}

/// An OWNER's User row has instituteId = null (they're org-scoped), so the
/// tenant check has to go through their organization instead.
async function assertValidInvigilator(userId: string, instituteId: string, organizationId: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive || !INVIGILATOR_ROLES.includes(user.role as (typeof INVIGILATOR_ROLES)[number])) {
    throw ApiError.badRequest("Invigilator not found");
  }
  if (user.role === "OWNER") {
    const org = organizationId ? await prisma.organization.findUnique({ where: { id: organizationId } }) : null;
    if (!org || org.ownerId !== user.id) throw ApiError.badRequest("Invigilator not found");
  } else if (user.instituteId !== instituteId) {
    throw ApiError.badRequest("Invigilator not found");
  }
}

// ---------------------------------------------------------------------------
// Invigilator picker
// ---------------------------------------------------------------------------

testsRouter.get("/invigilators", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const staff = await prisma.user.findMany({
      where: {
        instituteId: req.tenantId!,
        role: { in: ["ADMIN", "FACULTY"] },
        isActive: true,
      },
      select: { id: true, fullName: true, role: true },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
    });

    const org = req.user!.organizationId
      ? await prisma.organization.findUnique({
          where: { id: req.user!.organizationId },
          include: { owner: { select: { id: true, fullName: true, role: true, isActive: true } } },
        })
      : null;

    const list = org?.owner?.isActive
      ? [{ id: org.owner.id, fullName: org.owner.fullName, role: org.owner.role }, ...staff]
      : staff;

    res.json(list);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Test CRUD
// ---------------------------------------------------------------------------

const sessionSchema = z.object({
  batchId: z.string().min(1),
  date: z.coerce.date(),
  startTime: timeSchema,
  endTime: timeSchema,
  invigilatorId: z.string().min(1, "An invigilator is required"),
});

const createTestSchema = z.object({
  courseId: z.string().min(1, "Course is required"),
  subjectId: z.string().min(1, "Subject is required"),
  title: z.string().min(1, "Title is required").max(150),
  totalMarks: z.number().int().positive("Total marks must be greater than zero"),
  passingMarks: z.number().int().min(0).optional(),
  instructions: z.string().max(2000).optional(),
  paperAssetUrl: z.string().url().optional(),
  paperAssetType: z.enum(["pdf", "image"]).optional(),
  paperAssetName: z.string().max(255).optional(),
  sessions: z.array(sessionSchema).min(1, "Schedule the test for at least one batch"),
  /// Lecture ids the admin has explicitly agreed to split around this test.
  acceptSplitFor: z.array(z.string()).default([]),
});

testsRouter.post("/", requireRoles(...MANAGE_ROLES), validateBody(createTestSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createTestSchema>;
    const instituteId = req.tenantId!;

    const course = await prisma.course.findUnique({ where: { id: body.courseId } });
    if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");

    const subjectLink = await prisma.courseSubject.findUnique({
      where: { courseId_subjectId: { courseId: body.courseId, subjectId: body.subjectId } },
    });
    if (!subjectLink) throw ApiError.badRequest("Selected subject is not linked to this course");

    if (body.passingMarks !== undefined && body.passingMarks > body.totalMarks) {
      throw ApiError.badRequest("Passing marks can't exceed total marks");
    }

    // Validate every session before creating anything, so a conflict on the
    // third batch never leaves a half-scheduled test behind.
    const pendingSplits: { batchId: string; batchName: string; split: ConflictSplit }[] = [];

    for (const session of body.sessions) {
      const batch = await prisma.batch.findUnique({ where: { id: session.batchId } });
      if (!batch || batch.instituteId !== instituteId) throw ApiError.badRequest("Batch not found");
      if (batch.courseId !== body.courseId) {
        throw ApiError.badRequest(`"${batch.name}" doesn't belong to the selected course`);
      }
      if (session.endTime <= session.startTime) throw ApiError.badRequest("End time must be after start time");

      await assertValidInvigilator(session.invigilatorId, instituteId, req.user!.organizationId);

      const conflict = await checkSessionConflict({
        batchId: session.batchId,
        date: session.date,
        startTime: toTimeDate(session.startTime),
        endTime: toTimeDate(session.endTime),
      });

      if (conflict.kind === "BLOCKED") throw ApiError.conflict(conflict.reason!, "SCHEDULE_CONFLICT");
      if (conflict.kind === "SPLITTABLE" && !body.acceptSplitFor.includes(conflict.split!.conflictLectureId)) {
        pendingSplits.push({ batchId: batch.id, batchName: batch.name, split: conflict.split! });
      }
    }

    // Nothing is created until the admin has OK'd every proposed split.
    if (pendingSplits.length > 0) {
      return res.status(409).json({
        error: {
          code: "SPLIT_REQUIRED",
          message: "This test overlaps existing lectures. Confirm how to split them to continue.",
        },
        conflicts: pendingSplits,
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const test = await tx.test.create({
        data: {
          instituteId,
          courseId: body.courseId,
          subjectId: body.subjectId,
          title: body.title,
          totalMarks: body.totalMarks,
          passingMarks: body.passingMarks,
          instructions: body.instructions,
          paperAssetUrl: body.paperAssetUrl,
          paperAssetType: body.paperAssetType,
          paperAssetName: body.paperAssetName,
          createdByUserId: req.user!.id,
        },
        include: testInclude,
      });

      for (const session of body.sessions) {
        const start = toTimeDate(session.startTime);
        const end = toTimeDate(session.endTime);

        // Re-checked inside the transaction — the split is only applied now
        // that the admin has confirmed it.
        const conflict = await checkSessionConflict({
          batchId: session.batchId,
          date: session.date,
          startTime: start,
          endTime: end,
        });

        if (conflict.kind === "SPLITTABLE") {
          const split = conflict.split!;
          const original = await tx.lecture.findUniqueOrThrow({ where: { id: split.conflictLectureId } });

          if (split.before) {
            await tx.lecture.update({
              where: { id: original.id },
              data: { endTime: toTimeDate(split.before.endTime) },
            });
          } else {
            // The test covers the lecture's whole leading edge — nothing left
            // before it, so the original row becomes the trailing remainder
            // (or disappears entirely if there's no remainder either).
            if (split.after) {
              await tx.lecture.update({
                where: { id: original.id },
                data: { startTime: toTimeDate(split.after.startTime), endTime: toTimeDate(split.after.endTime) },
              });
            } else {
              await tx.lecture.delete({ where: { id: original.id } });
            }
          }

          if (split.before && split.after) {
            await tx.lecture.create({
              data: {
                instituteId,
                batchId: original.batchId,
                subjectId: original.subjectId,
                facultyId: original.facultyId,
                date: original.date,
                startTime: toTimeDate(split.after.startTime),
                endTime: toTimeDate(split.after.endTime),
                note: original.note,
              },
            });
          }
        }

        await tx.lecture.create({
          data: {
            instituteId,
            batchId: session.batchId,
            subjectId: body.subjectId,
            facultyId: session.invigilatorId,
            kind: "TEST",
            testId: test.id,
            date: session.date,
            startTime: start,
            endTime: end,
          },
        });
      }

      return test;
    });

    res.status(201).json(serializeTest(created));
  } catch (err) {
    next(err);
  }
});

testsRouter.get("/", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;

    const tests = await prisma.test.findMany({
      where: { instituteId, courseId },
      include: {
        ...testInclude,
        sessions: { include: { batch: { select: { id: true, name: true } } }, orderBy: { date: "asc" } },
        _count: { select: { results: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      tests.map((t) => ({
        ...serializeTest(t),
        sessionCount: t.sessions.length,
        resultCount: t._count.results,
        batches: t.sessions.map((s) => s.batch.name),
        firstDate: t.sessions[0]?.date ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

testsRouter.get("/:id", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const test = await loadTest(req.params.id as string, instituteId);

    const sessions = await prisma.lecture.findMany({
      where: { testId: test.id },
      include: lectureInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    const detailed = await Promise.all(
      sessions.map(async (s) => {
        const [markedCount, presentCount, resultCount, roster] = await Promise.all([
          prisma.attendanceRecord.count({ where: { lectureId: s.id } }),
          prisma.attendanceRecord.count({ where: { lectureId: s.id, status: { in: [...PRESENT_STATUSES] } } }),
          prisma.testResult.count({ where: { lectureId: s.id } }),
          deriveRoster(s.batchId, s.date),
        ]);
        return { ...serializeLecture(s), expected: roster.length, markedCount, presentCount, resultCount };
      })
    );

    res.json({ ...serializeTest(test), sessions: detailed });
  } catch (err) {
    next(err);
  }
});

const updateTestSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  totalMarks: z.number().int().positive().optional(),
  passingMarks: z.number().int().min(0).nullable().optional(),
  instructions: z.string().max(2000).nullable().optional(),
  paperAssetUrl: z.string().url().nullable().optional(),
  paperAssetType: z.enum(["pdf", "image"]).nullable().optional(),
  paperAssetName: z.string().max(255).nullable().optional(),
});

testsRouter.patch("/:id", requireRoles(...MANAGE_ROLES), validateBody(updateTestSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateTestSchema>;
    const test = await loadTest(req.params.id as string, instituteId);

    const totalMarks = body.totalMarks ?? test.totalMarks;
    const passingMarks = body.passingMarks === undefined ? test.passingMarks : body.passingMarks;
    if (passingMarks !== null && passingMarks > totalMarks) {
      throw ApiError.badRequest("Passing marks can't exceed total marks");
    }
    if (body.totalMarks !== undefined) {
      const beyond = await prisma.testResult.count({
        where: { testId: test.id, marksObtained: { gt: new Prisma.Decimal(body.totalMarks) } },
      });
      if (beyond > 0) {
        throw ApiError.badRequest(`${beyond} student(s) already have marks above ${body.totalMarks}. Fix those results first.`);
      }
    }

    const updated = await prisma.test.update({ where: { id: test.id }, data: body, include: testInclude });
    res.json(serializeTest(updated));
  } catch (err) {
    next(err);
  }
});

testsRouter.delete("/:id", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const test = await loadTest(req.params.id as string, req.tenantId!);

    const marked = await prisma.attendanceRecord.count({ where: { lecture: { testId: test.id } } });
    if (marked > 0) {
      throw ApiError.badRequest("This test already has attendance recorded — cancel its sessions instead of deleting it.");
    }

    await prisma.test.delete({ where: { id: test.id } }); // sessions + results cascade
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Results — marks for students who actually sat the test
// ---------------------------------------------------------------------------

const saveResultsSchema = z.object({
  results: z
    .array(
      z.object({
        studentId: z.string().min(1),
        marksObtained: z.number().min(0),
        remarks: z.string().max(300).optional(),
      })
    )
    .min(1, "Enter marks for at least one student"),
});

testsRouter.post(
  "/:id/sessions/:lectureId/results",
  requireRoles(...MANAGE_ROLES),
  validateBody(saveResultsSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof saveResultsSchema>;
      const test = await loadTest(req.params.id as string, instituteId);
      const session = await loadSession(test.id, req.params.lectureId as string, instituteId);
      assertCanActOnLecture(req, session.facultyId);

      const attendance = await prisma.attendanceRecord.findMany({ where: { lectureId: session.id } });
      if (attendance.length === 0) {
        throw ApiError.badRequest("Mark attendance for this test before entering marks.");
      }

      const eligible = new Set(
        attendance
          .filter((a) => PRESENT_STATUSES.includes(a.status as (typeof PRESENT_STATUSES)[number]))
          .map((a) => a.studentId)
      );

      for (const r of body.results) {
        if (!eligible.has(r.studentId)) {
          throw ApiError.badRequest("Marks can only be entered for students marked present for this test.");
        }
        if (r.marksObtained > test.totalMarks) {
          throw ApiError.badRequest(`Marks can't exceed the total of ${test.totalMarks}.`);
        }
      }

      await prisma.$transaction(
        body.results.map((r) =>
          prisma.testResult.upsert({
            where: { lectureId_studentId: { lectureId: session.id, studentId: r.studentId } },
            create: {
              testId: test.id,
              lectureId: session.id,
              studentId: r.studentId,
              marksObtained: new Prisma.Decimal(r.marksObtained),
              remarks: r.remarks,
              enteredByUserId: req.user!.id,
            },
            update: {
              marksObtained: new Prisma.Decimal(r.marksObtained),
              remarks: r.remarks,
              enteredByUserId: req.user!.id,
            },
          })
        )
      );

      res.json({ saved: body.results.length });
    } catch (err) {
      next(err);
    }
  }
);

/// One call powering both the marks-entry screen and the printable report.
testsRouter.get("/:id/sessions/:lectureId/report", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const test = await loadTest(req.params.id as string, instituteId);
    const session = await loadSession(test.id, req.params.lectureId as string, instituteId);

    const [roster, attendance, results, institute] = await Promise.all([
      deriveRoster(session.batchId, session.date),
      prisma.attendanceRecord.findMany({ where: { lectureId: session.id } }),
      prisma.testResult.findMany({ where: { lectureId: session.id } }),
      prisma.institute.findUnique({ where: { id: instituteId }, select: { name: true } }),
    ]);

    const statusByStudent = new Map(attendance.map((a) => [a.studentId, a.status]));
    const resultByStudent = new Map(results.map((r) => [r.studentId, r]));

    const rows = roster.map((s) => {
      const status = statusByStudent.get(s.id) ?? null;
      const result = resultByStudent.get(s.id);
      const present = status !== null && PRESENT_STATUSES.includes(status as (typeof PRESENT_STATUSES)[number]);
      return {
        student: s,
        attendanceStatus: status,
        present,
        marksObtained: result ? money(result.marksObtained) : null,
        remarks: result?.remarks ?? null,
        passed: result && test.passingMarks !== null ? result.marksObtained.gte(test.passingMarks) : null,
      };
    });

    const scored = rows.filter((r) => r.marksObtained !== null).map((r) => Number(r.marksObtained));
    const summary = {
      total: rows.length,
      present: rows.filter((r) => r.present).length,
      absent: rows.filter((r) => r.attendanceStatus !== null && !r.present).length,
      graded: scored.length,
      highest: scored.length ? Math.max(...scored).toFixed(2) : null,
      lowest: scored.length ? Math.min(...scored).toFixed(2) : null,
      average: scored.length ? (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(2) : null,
      passed: test.passingMarks !== null ? rows.filter((r) => r.passed === true).length : null,
    };

    res.json({
      test: serializeTest(test),
      instituteName: institute?.name ?? "",
      session: serializeLecture(session),
      rows,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Question-paper upload (local disk, services/uploads.ts) — optional per test
// ---------------------------------------------------------------------------

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

testsRouter.post("/upload", requireRoles(...MANAGE_ROLES), upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) throw ApiError.badRequest("No file was uploaded.");
    const asset = await uploadTestPaper(req.file, req.tenantId!);
    res.status(201).json(asset);
  } catch (err) {
    next(err);
  }
});
