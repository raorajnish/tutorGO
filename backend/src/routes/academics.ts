import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";

export const academicsRouter = Router();

academicsRouter.use(authenticate, requireInstitute);

const MANAGE_ROLES = ["OWNER", "ADMIN", "RECEPTION"] as const;

const courseCodeSchema = z
  .string()
  .min(2, "Course code must be 2-8 characters")
  .max(8, "Course code must be 2-8 characters")
  .regex(/^[A-Za-z0-9]+$/, "Course code must be alphanumeric");

const subjectCodeSchema = z
  .string()
  .min(1, "Subject code must be 1-6 characters")
  .max(6, "Subject code must be 1-6 characters")
  .regex(/^[A-Za-z0-9]+$/, "Subject code must be alphanumeric");

// ---------------------------------------------------------------------------
// Courses (doubles as "class/standard")
// ---------------------------------------------------------------------------

academicsRouter.get("/courses", async (req, res, next) => {
  try {
    const courses = await prisma.course.findMany({
      where: { instituteId: req.tenantId! },
      include: {
        _count: { select: { batches: true, students: true, subjects: true } },
      },
      orderBy: { name: "asc" },
    });

    res.json(
      courses.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        durationMonths: c.durationMonths,
        description: c.description,
        isActive: c.isActive,
        batchCount: c._count.batches,
        studentCount: c._count.students,
        subjectCount: c._count.subjects,
      }))
    );
  } catch (err) {
    next(err);
  }
});

const createCourseSchema = z.object({
  name: z.string().min(1, "Course name is required"),
  code: courseCodeSchema,
  durationMonths: z.number().int().positive().optional(),
  description: z.string().optional(),
});

academicsRouter.post("/courses", requireRoles(...MANAGE_ROLES), validateBody(createCourseSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createCourseSchema>;
    const code = body.code.toUpperCase();
    const instituteId = req.tenantId!;

    const existing = await prisma.course.findUnique({ where: { instituteId_code: { instituteId, code } } });
    if (existing) throw ApiError.conflict("A course with this code already exists");

    const course = await prisma.course.create({
      data: { instituteId, name: body.name, code, durationMonths: body.durationMonths, description: body.description },
    });

    await auditLog({
      action: "COURSE_CREATED",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "Course",
      targetId: course.id,
      metadata: { code },
    });

    res.status(201).json(course);
  } catch (err) {
    next(err);
  }
});

const updateCourseSchema = z.object({
  name: z.string().min(1).optional(),
  code: courseCodeSchema.optional(),
  durationMonths: z.number().int().positive().nullable().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

academicsRouter.patch("/courses/:id", requireRoles(...MANAGE_ROLES), validateBody(updateCourseSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateCourseSchema>;

    const course = await prisma.course.findUnique({ where: { id: req.params.id as string } });
    if (!course || course.instituteId !== instituteId) throw ApiError.notFound("Course not found");

    if (body.code) {
      const code = body.code.toUpperCase();
      const clash = await prisma.course.findUnique({ where: { instituteId_code: { instituteId, code } } });
      if (clash && clash.id !== course.id) throw ApiError.conflict("A course with this code already exists");
    }

    const updated = await prisma.course.update({
      where: { id: course.id },
      data: { ...body, code: body.code ? body.code.toUpperCase() : undefined },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Subjects (many-to-many with Course via CourseSubject)
// ---------------------------------------------------------------------------

academicsRouter.get("/subjects", async (req, res, next) => {
  try {
    const subjects = await prisma.subject.findMany({
      where: { instituteId: req.tenantId! },
      include: { courses: { include: { course: { select: { id: true, name: true, code: true } } } } },
      orderBy: { name: "asc" },
    });

    res.json(
      subjects.map((s) => ({
        id: s.id,
        name: s.name,
        shortCode: s.shortCode,
        isActive: s.isActive,
        courses: s.courses.map((cs) => cs.course),
      }))
    );
  } catch (err) {
    next(err);
  }
});

const subjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  shortCode: subjectCodeSchema,
  courseIds: z.array(z.string()).default([]),
});

academicsRouter.post("/subjects", requireRoles(...MANAGE_ROLES), validateBody(subjectSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof subjectSchema>;
    const shortCode = body.shortCode.toUpperCase();
    const instituteId = req.tenantId!;

    const existing = await prisma.subject.findUnique({ where: { instituteId_shortCode: { instituteId, shortCode } } });
    if (existing) throw ApiError.conflict("A subject with this code already exists");

    if (body.courseIds.length > 0) {
      const count = await prisma.course.count({ where: { id: { in: body.courseIds }, instituteId } });
      if (count !== body.courseIds.length) throw ApiError.badRequest("One or more selected courses were not found");
    }

    const subject = await prisma.subject.create({
      data: {
        instituteId,
        name: body.name,
        shortCode,
        courses: { create: body.courseIds.map((courseId) => ({ courseId })) },
      },
      include: { courses: { include: { course: { select: { id: true, name: true, code: true } } } } },
    });

    res.status(201).json({
      id: subject.id,
      name: subject.name,
      shortCode: subject.shortCode,
      isActive: subject.isActive,
      courses: subject.courses.map((cs) => cs.course),
    });
  } catch (err) {
    next(err);
  }
});

const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  shortCode: subjectCodeSchema.optional(),
  courseIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

academicsRouter.patch("/subjects/:id", requireRoles(...MANAGE_ROLES), validateBody(updateSubjectSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateSubjectSchema>;

    const subject = await prisma.subject.findUnique({ where: { id: req.params.id as string } });
    if (!subject || subject.instituteId !== instituteId) throw ApiError.notFound("Subject not found");

    if (body.shortCode) {
      const shortCode = body.shortCode.toUpperCase();
      const clash = await prisma.subject.findUnique({ where: { instituteId_shortCode: { instituteId, shortCode } } });
      if (clash && clash.id !== subject.id) throw ApiError.conflict("A subject with this code already exists");
    }

    if (body.courseIds) {
      const count = await prisma.course.count({ where: { id: { in: body.courseIds }, instituteId } });
      if (count !== body.courseIds.length) throw ApiError.badRequest("One or more selected courses were not found");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.courseIds) {
        await tx.courseSubject.deleteMany({ where: { subjectId: subject.id } });
        if (body.courseIds.length > 0) {
          await tx.courseSubject.createMany({
            data: body.courseIds.map((courseId) => ({ subjectId: subject.id, courseId })),
          });
        }
      }

      return tx.subject.update({
        where: { id: subject.id },
        data: {
          name: body.name,
          shortCode: body.shortCode ? body.shortCode.toUpperCase() : undefined,
          isActive: body.isActive,
        },
        include: { courses: { include: { course: { select: { id: true, name: true, code: true } } } } },
      });
    });

    res.json({
      id: updated.id,
      name: updated.name,
      shortCode: updated.shortCode,
      isActive: updated.isActive,
      courses: updated.courses.map((cs) => cs.course),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

academicsRouter.get("/batches", async (req, res, next) => {
  try {
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;

    const batches = await prisma.batch.findMany({
      where: { instituteId: req.tenantId!, courseId },
      include: {
        course: { select: { id: true, name: true, code: true } },
        students: { where: { leftAt: null } },
      },
      orderBy: { startDate: "desc" },
    });

    res.json(
      batches.map((b) => ({
        id: b.id,
        name: b.name,
        course: b.course,
        startDate: b.startDate,
        endDate: b.endDate,
        isActive: b.isActive,
        enrolledCount: b.students.length,
        lectureCount: 0, // populated once Attendance (Phase 4) exists
      }))
    );
  } catch (err) {
    next(err);
  }
});

const batchSchema = z.object({
  name: z.string().min(1, "Batch name is required"),
  courseId: z.string().min(1, "Course is required"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
});

academicsRouter.post("/batches", requireRoles(...MANAGE_ROLES), validateBody(batchSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof batchSchema>;
    const instituteId = req.tenantId!;

    const course = await prisma.course.findUnique({ where: { id: body.courseId } });
    if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");

    const batch = await prisma.batch.create({
      data: {
        instituteId,
        courseId: body.courseId,
        name: body.name,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
      },
      include: { course: { select: { id: true, name: true, code: true } } },
    });

    res.status(201).json({ ...batch, enrolledCount: 0, lectureCount: 0 });
  } catch (err) {
    next(err);
  }
});

const updateBatchSchema = z.object({
  name: z.string().min(1).optional(),
  courseId: z.string().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

academicsRouter.patch("/batches/:id", requireRoles(...MANAGE_ROLES), validateBody(updateBatchSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateBatchSchema>;

    const batch = await prisma.batch.findUnique({ where: { id: req.params.id as string } });
    if (!batch || batch.instituteId !== instituteId) throw ApiError.notFound("Batch not found");

    if (body.courseId) {
      const course = await prisma.course.findUnique({ where: { id: body.courseId } });
      if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");
    }

    const updated = await prisma.batch.update({
      where: { id: batch.id },
      data: body,
      include: { course: { select: { id: true, name: true, code: true } }, students: { where: { leftAt: null } } },
    });

    res.json({
      id: updated.id,
      name: updated.name,
      course: updated.course,
      startDate: updated.startDate,
      endDate: updated.endDate,
      isActive: updated.isActive,
      enrolledCount: updated.students.length,
      lectureCount: 0,
    });
  } catch (err) {
    next(err);
  }
});
