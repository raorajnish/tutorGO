import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";

export const studentsRouter = Router();

studentsRouter.use(authenticate, requireInstitute, requireRoles("OWNER", "ADMIN", "RECEPTION"));

studentsRouter.get("/", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const status = typeof req.query.status === "string" ? req.query.status : "active";

    const [students, activeCount, totalCount, activeBatchCount] = await Promise.all([
      prisma.student.findMany({
        where: {
          instituteId,
          isActive: status === "all" ? undefined : status === "inactive" ? false : true,
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
        },
        orderBy: { createdAt: "desc" },
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
    const student = await loadStudent(req.params.id as string, req.tenantId!);

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
      enquiry: student.enquiry,
      batchHistory: student.batches.map((sb) => ({
        id: sb.id,
        batch: sb.batch,
        joinedAt: sb.joinedAt,
        leftAt: sb.leftAt,
      })),
      // Stubs — populated once Fees (Phase 5) / Attendance (Phase 4) exist.
      feeAccount: null,
      recentAttendance: [],
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
