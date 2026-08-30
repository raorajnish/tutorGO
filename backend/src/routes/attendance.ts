import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  assertCanActOnLecture,
  deriveRoster,
  lectureInclude,
  serializeLecture,
  timeSchema,
  toTimeDate,
} from "../lib/lectureShared.js";
import { todayDateOnly } from "../lib/dateOnly.js";

export const attendanceRouter = Router();

attendanceRouter.use(authenticate, requireInstitute, requireModule("ATTENDANCE"));

const SCHEDULE_ROLES = ["OWNER", "ADMIN", "RECEPTION", "FACULTY"] as const;
const STATUS_ENUM = z.enum(["PRESENT", "ABSENT", "LEAVE", "LATE", "HOLIDAY", "PRESENT_BIOMETRIC"]);

function facultyScope(req: { user?: { role: string; id: string } }): string | undefined {
  return req.user!.role === "FACULTY" ? req.user!.id : undefined;
}

async function loadLecture(id: string, instituteId: string) {
  const lecture = await prisma.lecture.findUnique({ where: { id }, include: lectureInclude });
  if (!lecture || lecture.instituteId !== instituteId) throw ApiError.notFound("Lecture not found");
  return lecture;
}

/// Faculty scheduling their own lecture may only pick a course/subject they're
/// assigned to teach — OWNER/ADMIN/RECEPTION scheduling on a faculty's behalf
/// are never restricted by that faculty's assignments (an admin can override).
async function assertFacultyAssignment(facultyId: string, courseId: string, subjectId: string) {
  const rows = await prisma.facultyAssignment.findMany({ where: { facultyId, courseId } });
  if (rows.length === 0) throw ApiError.forbidden("You are not assigned to teach this course");
  const subjectScoped = rows.filter((r) => r.subjectId !== null);
  if (subjectScoped.length > 0 && !subjectScoped.some((r) => r.subjectId === subjectId)) {
    throw ApiError.forbidden("You are not assigned to teach this subject in this course");
  }
}

attendanceRouter.get("/faculty", requireRoles(...SCHEDULE_ROLES), async (req, res, next) => {
  try {
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;

    const faculty = await prisma.user.findMany({
      where: {
        instituteId: req.tenantId!,
        role: "FACULTY",
        isActive: true,
        teachingAssignments: courseId ? { some: { courseId } } : undefined,
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
    res.json(faculty);
  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// Faculty teaching assignments (which courses/subjects a faculty can teach)
// ---------------------------------------------------------------------------

async function resolveAssignments(facultyId: string, instituteId: string) {
  const rows = await prisma.facultyAssignment.findMany({
    where: { facultyId },
    include: {
      course: { select: { id: true, name: true, code: true, instituteId: true } },
      subject: { select: { id: true, name: true, shortCode: true } },
    },
  });

  const byCourse = new Map<
    string,
    { course: { id: string; name: string; code: string; instituteId: string }; subjectIds: string[] | null }
  >();
  for (const row of rows) {
    if (row.course.instituteId !== instituteId) continue;
    const existing = byCourse.get(row.courseId);
    if (row.subjectId === null) {
      byCourse.set(row.courseId, { course: row.course, subjectIds: null });
    } else if (existing?.subjectIds !== null) {
      const subjectIds = existing?.subjectIds ?? [];
      byCourse.set(row.courseId, { course: row.course, subjectIds: [...subjectIds, row.subjectId] });
    }
  }

  const courseIds = [...byCourse.keys()];
  const courseSubjects = await prisma.courseSubject.findMany({
    where: { courseId: { in: courseIds } },
    include: { subject: { select: { id: true, name: true, shortCode: true } } },
  });

  return courseIds.map((courseId) => {
    const entry = byCourse.get(courseId)!;
    const allLinked = courseSubjects.filter((cs) => cs.courseId === courseId).map((cs) => cs.subject);
    const allSubjects = entry.subjectIds === null;
    const subjects = allSubjects ? allLinked : allLinked.filter((s) => entry.subjectIds!.includes(s.id));
    const { instituteId: _instituteId, ...course } = entry.course;
    return { course, allSubjects, subjects };
  });
}

attendanceRouter.get("/faculty/:id/assignments", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const facultyId = req.params.id as string;
    if (req.user!.role !== "OWNER" && req.user!.role !== "ADMIN" && facultyId !== req.user!.id) {
      throw ApiError.forbidden("You can only view your own assignments");
    }

    const faculty = await prisma.user.findUnique({ where: { id: facultyId } });
    if (!faculty || faculty.instituteId !== instituteId || faculty.role !== "FACULTY") {
      throw ApiError.notFound("Faculty not found");
    }

    res.json(await resolveAssignments(facultyId, instituteId));
  } catch (err) {
    next(err);
  }
});

const assignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      courseId: z.string().min(1),
      subjectIds: z.array(z.string()).default([]),
    })
  ),
});

attendanceRouter.put(
  "/faculty/:id/assignments",
  requireRoles("OWNER", "ADMIN"),
  validateBody(assignmentsSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const facultyId = req.params.id as string;
      const body = req.body as z.infer<typeof assignmentsSchema>;

      const faculty = await prisma.user.findUnique({ where: { id: facultyId } });
      if (!faculty || faculty.instituteId !== instituteId || faculty.role !== "FACULTY") {
        throw ApiError.notFound("Faculty not found");
      }

      const courseIds = body.assignments.map((a) => a.courseId);
      if (courseIds.length > 0) {
        const courses = await prisma.course.findMany({ where: { id: { in: courseIds }, instituteId } });
        if (courses.length !== new Set(courseIds).size) throw ApiError.badRequest("One or more courses were not found");
      }

      for (const a of body.assignments) {
        if (a.subjectIds.length === 0) continue;
        const links = await prisma.courseSubject.findMany({
          where: { courseId: a.courseId, subjectId: { in: a.subjectIds } },
        });
        if (links.length !== new Set(a.subjectIds).size) {
          throw ApiError.badRequest("One or more subjects are not linked to their course");
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.facultyAssignment.deleteMany({ where: { facultyId } });
        for (const a of body.assignments) {
          if (a.subjectIds.length === 0) {
            await tx.facultyAssignment.create({ data: { facultyId, courseId: a.courseId, subjectId: null } });
          } else {
            await tx.facultyAssignment.createMany({
              data: a.subjectIds.map((subjectId) => ({ facultyId, courseId: a.courseId, subjectId })),
            });
          }
        }
      });

      res.json(await resolveAssignments(facultyId, instituteId));
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Lecture scheduling
// ---------------------------------------------------------------------------

attendanceRouter.get("/lectures", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const date = typeof req.query.date === "string" ? req.query.date : undefined;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
    const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    let dateFilter: { gte?: Date; lt?: Date } | Date | undefined;
    if (scope === "upcoming") dateFilter = { gte: todayDateOnly() };
    else if (scope === "history") dateFilter = { lt: todayDateOnly() };
    else if (date) dateFilter = new Date(date);

    const lectures = await prisma.lecture.findMany({
      where: {
        instituteId,
        batchId,
        facultyId: facultyScope(req),
        date: dateFilter,
        // A cancelled lecture isn't "upcoming" in any actionable sense —
        // excluded here, but still shown in history/day views for context.
        cancelledAt: scope === "upcoming" ? null : undefined,
      },
      include: lectureInclude,
      orderBy: scope === "upcoming" ? [{ date: "asc" }, { startTime: "asc" }] : [{ date: "desc" }, { startTime: "asc" }],
      take: limit,
    });

    const ids = lectures.map((l) => l.id);
    const counts = await prisma.attendanceRecord.groupBy({
      by: ["lectureId", "status"],
      where: { lectureId: { in: ids } },
      _count: true,
    });

    res.json(
      lectures.map((l) => {
        const markedCount = counts
          .filter((c) => c.lectureId === l.id)
          .reduce((sum, c) => sum + c._count, 0);
        return { ...serializeLecture(l), markedCount };
      })
    );
  } catch (err) {
    next(err);
  }
});

const noteSchema = z.string().max(300, "Note must be 300 characters or fewer");

const createLectureSchema = z.object({
  batchId: z.string().min(1, "Batch is required"),
  subjectId: z.string().min(1, "Subject is required"),
  date: z.coerce.date(),
  startTime: timeSchema,
  endTime: timeSchema,
  facultyId: z.string().optional(),
  note: noteSchema.optional(),
});

attendanceRouter.post("/lectures", requireRoles(...SCHEDULE_ROLES), validateBody(createLectureSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createLectureSchema>;
    const instituteId = req.tenantId!;

    const facultyId = body.facultyId ?? (req.user!.role === "FACULTY" ? req.user!.id : undefined);
    if (!facultyId) throw ApiError.badRequest("Faculty is required");
    assertCanActOnLecture(req, facultyId);

    const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
    if (!batch || batch.instituteId !== instituteId) throw ApiError.badRequest("Batch not found");

    const subjectLink = await prisma.courseSubject.findUnique({
      where: { courseId_subjectId: { courseId: batch.courseId, subjectId: body.subjectId } },
    });
    if (!subjectLink) throw ApiError.badRequest("Selected subject is not linked to this batch's course");

    const faculty = await prisma.user.findUnique({ where: { id: facultyId } });
    if (!faculty || faculty.instituteId !== instituteId || faculty.role !== "FACULTY") {
      throw ApiError.badRequest("Faculty not found");
    }

    if (req.user!.role === "FACULTY") {
      await assertFacultyAssignment(facultyId, batch.courseId, body.subjectId);
    }

    if (body.endTime <= body.startTime) throw ApiError.badRequest("End time must be after start time");

    const lecture = await prisma.lecture.create({
      data: {
        instituteId,
        batchId: body.batchId,
        subjectId: body.subjectId,
        facultyId,
        date: body.date,
        startTime: toTimeDate(body.startTime),
        endTime: toTimeDate(body.endTime),
        note: body.note,
      },
      include: lectureInclude,
    });

    res.status(201).json({ ...serializeLecture(lecture), markedCount: 0 });
  } catch (err) {
    next(err);
  }
});

const updateLectureSchema = z.object({
  batchId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  facultyId: z.string().optional(),
  note: noteSchema.nullable().optional(),
});

attendanceRouter.patch("/lectures/:id", requireRoles(...SCHEDULE_ROLES), validateBody(updateLectureSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateLectureSchema>;
    const lecture = await loadLecture(req.params.id as string, instituteId);
    assertCanActOnLecture(req, lecture.facultyId);
    if (body.facultyId) assertCanActOnLecture(req, body.facultyId);
    if (lecture.cancelledAt) throw ApiError.badRequest("This lecture has been cancelled");

    if (body.startTime && body.endTime && body.endTime <= body.startTime) {
      throw ApiError.badRequest("End time must be after start time");
    }

    if (req.user!.role === "FACULTY") {
      const resolvedBatchId = body.batchId ?? lecture.batch.id;
      const resolvedSubjectId = body.subjectId ?? lecture.subject.id;
      const resolvedBatch = await prisma.batch.findUnique({ where: { id: resolvedBatchId } });
      if (!resolvedBatch || resolvedBatch.instituteId !== instituteId) throw ApiError.badRequest("Batch not found");
      await assertFacultyAssignment(lecture.facultyId, resolvedBatch.courseId, resolvedSubjectId);
    }

    const updated = await prisma.lecture.update({
      where: { id: lecture.id },
      data: {
        batchId: body.batchId,
        subjectId: body.subjectId,
        date: body.date,
        startTime: body.startTime ? toTimeDate(body.startTime) : undefined,
        endTime: body.endTime ? toTimeDate(body.endTime) : undefined,
        facultyId: body.facultyId,
        note: body.note,
      },
      include: lectureInclude,
    });

    res.json(serializeLecture(updated));
  } catch (err) {
    next(err);
  }
});

attendanceRouter.delete("/lectures/:id", requireRoles(...SCHEDULE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const lecture = await loadLecture(req.params.id as string, instituteId);
    assertCanActOnLecture(req, lecture.facultyId);

    const recordCount = await prisma.attendanceRecord.count({ where: { lectureId: lecture.id } });
    if (recordCount > 0) {
      throw ApiError.conflict("This lecture already has recorded attendance and can't be deleted");
    }

    await prisma.lecture.delete({ where: { id: lecture.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const cancelLectureSchema = z.object({
  reason: z.string().min(1, "A reason is required").max(300, "Reason must be 300 characters or fewer"),
});

attendanceRouter.post(
  "/lectures/:id/cancel",
  requireRoles(...SCHEDULE_ROLES),
  validateBody(cancelLectureSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof cancelLectureSchema>;
      const lecture = await loadLecture(req.params.id as string, instituteId);
      assertCanActOnLecture(req, lecture.facultyId);
      if (lecture.cancelledAt) throw ApiError.badRequest("This lecture is already cancelled");

      const updated = await prisma.lecture.update({
        where: { id: lecture.id },
        data: { cancelledAt: new Date(), cancelReason: body.reason },
        include: lectureInclude,
      });

      res.json(serializeLecture(updated));
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Roster + marking
// ---------------------------------------------------------------------------

attendanceRouter.get("/lectures/:id/roster", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const lecture = await loadLecture(req.params.id as string, instituteId);
    assertCanActOnLecture(req, lecture.facultyId);
    const roster = await deriveRoster(lecture.batchId, lecture.date, lecture.subjectId);

    const records = await prisma.attendanceRecord.findMany({ where: { lectureId: lecture.id } });
    const markedByIds = [...new Set(records.map((r) => r.markedById).filter((id): id is string => !!id))];
    const markers = await prisma.user.findMany({ where: { id: { in: markedByIds } }, select: { id: true, fullName: true } });
    const markerNames = new Map(markers.map((m) => [m.id, m.fullName]));
    const byStudent = new Map(records.map((r) => [r.studentId, r]));

    res.json(
      roster.map((s) => {
        const record = byStudent.get(s.id);
        return {
          student: s,
          status: record?.status ?? null,
          markedAt: record?.markedAt ?? null,
          markedByName: (record?.markedById && markerNames.get(record.markedById)) ?? null,
        };
      })
    );
  } catch (err) {
    next(err);
  }
});

const markSchema = z.object({
  records: z
    .array(z.object({ studentId: z.string().min(1), status: STATUS_ENUM }))
    .min(1, "At least one record is required"),
});

attendanceRouter.post("/lectures/:id/mark", requireRoles(...SCHEDULE_ROLES), validateBody(markSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof markSchema>;
    const lecture = await loadLecture(req.params.id as string, instituteId);
    assertCanActOnLecture(req, lecture.facultyId);
    if (lecture.cancelledAt) throw ApiError.badRequest("This lecture was cancelled — attendance can't be marked");

    const roster = await deriveRoster(lecture.batchId, lecture.date, lecture.subjectId);
    const rosterIds = new Set(roster.map((s) => s.id));
    for (const r of body.records) {
      if (!rosterIds.has(r.studentId)) throw ApiError.badRequest("One or more students are not on this lecture's roster");
    }

    await prisma.$transaction(
      body.records.map((r) =>
        prisma.attendanceRecord.upsert({
          where: { lectureId_studentId: { lectureId: lecture.id, studentId: r.studentId } },
          create: { lectureId: lecture.id, studentId: r.studentId, status: r.status, markedById: req.user!.id },
          update: { status: r.status, markedById: req.user!.id, markedAt: new Date() },
        })
      )
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

attendanceRouter.post("/lectures/:id/mark-all-present", requireRoles(...SCHEDULE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const lecture = await loadLecture(req.params.id as string, instituteId);
    assertCanActOnLecture(req, lecture.facultyId);
    if (lecture.cancelledAt) throw ApiError.badRequest("This lecture was cancelled — attendance can't be marked");

    const roster = await deriveRoster(lecture.batchId, lecture.date, lecture.subjectId);
    const existing = await prisma.attendanceRecord.findMany({ where: { lectureId: lecture.id } });
    const alreadyMarked = new Set(existing.map((r) => r.studentId));
    const unmarked = roster.filter((s) => !alreadyMarked.has(s.id));

    if (unmarked.length > 0) {
      await prisma.$transaction(
        unmarked.map((s) =>
          prisma.attendanceRecord.create({
            data: { lectureId: lecture.id, studentId: s.id, status: "PRESENT", markedById: req.user!.id },
          })
        )
      );
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Daily summary
// ---------------------------------------------------------------------------

attendanceRouter.get("/summary", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const date = typeof req.query.date === "string" ? new Date(req.query.date) : todayDateOnly();

    const lectures = await prisma.lecture.findMany({
      where: { instituteId, date, facultyId: facultyScope(req) },
      include: lectureInclude,
      orderBy: { startTime: "asc" },
    });

    const summary = await Promise.all(
      lectures.map(async (l) => {
        const roster = await deriveRoster(l.batchId, l.date, l.subjectId);
        const records = await prisma.attendanceRecord.findMany({ where: { lectureId: l.id } });
        const byStatus = (status: string) => records.filter((r) => r.status === status).length;

        return {
          ...serializeLecture(l),
          expected: roster.length,
          // Late counts toward "present" for attendance-rate purposes (they
          // did attend) but is also broken out separately so chronic
          // lateness is still visible at a glance.
          present: byStatus("PRESENT") + byStatus("PRESENT_BIOMETRIC") + byStatus("LATE"),
          absent: byStatus("ABSENT"),
          leave: byStatus("LEAVE"),
          late: byStatus("LATE"),
          holiday: byStatus("HOLIDAY"),
          unmarked: roster.length - records.length,
        };
      })
    );

    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Stats (for dashboard widgets / the faculty lecture-history view)
// ---------------------------------------------------------------------------

attendanceRouter.get("/stats", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const facultyId = facultyScope(req);
    const today = todayDateOnly();

    const [total, todayCount, upcomingCount] = await Promise.all([
      prisma.lecture.count({ where: { instituteId, facultyId } }),
      prisma.lecture.count({ where: { instituteId, facultyId, date: today } }),
      prisma.lecture.count({ where: { instituteId, facultyId, date: { gt: today } } }),
    ]);

    res.json({ total, today: todayCount, upcoming: upcomingCount });
  } catch (err) {
    next(err);
  }
});
