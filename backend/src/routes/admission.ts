import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";
import { nextStudentCode } from "../services/studentCode.js";

export const admissionRouter = Router();

admissionRouter.use(authenticate, requireInstitute, requireModule("ADMISSION"), requireRoles("OWNER", "ADMIN", "RECEPTION"));

const admitSchema = z.object({
  enquiryId: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email().optional(),
  phone: z.string().min(1, "Phone is required"),
  parentPhone: z.string().optional(),
  courseId: z.string().min(1, "Course is required"),
  dob: z.coerce.date().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  school: z.string().optional(),
  admissionDate: z.coerce.date(),
  batchId: z.string().min(1, "Batch is required"),
  fingerprintId: z.string().optional(),
});

admissionRouter.post("/", validateBody(admitSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof admitSchema>;
    const instituteId = req.tenantId!;

    const institute = await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } });

    const course = await prisma.course.findUnique({ where: { id: body.courseId } });
    if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");

    let enquiry = null;
    if (body.enquiryId) {
      enquiry = await prisma.enquiry.findUnique({ where: { id: body.enquiryId } });
      if (!enquiry || enquiry.instituteId !== instituteId) throw ApiError.badRequest("Enquiry not found");
      if (enquiry.status === "CONVERTED") throw ApiError.conflict("This enquiry has already been converted");
      if (enquiry.status === "LOST") throw ApiError.conflict("This enquiry is marked lost");
    }

    const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
    if (!batch || batch.instituteId !== instituteId) throw ApiError.badRequest("Batch not found");
    if (batch.courseId !== body.courseId) throw ApiError.badRequest("Selected batch does not belong to the selected course");

    const result = await prisma.$transaction(async (tx) => {
      const studentCode = await nextStudentCode(tx, instituteId, institute.code, body.admissionDate, course.code);
      const email = (body.email ?? `${studentCode}@tutorgo.in`).toLowerCase();

      const emailClash = await tx.student.findUnique({ where: { email } });
      if (emailClash) throw ApiError.conflict("A student with this email already exists");

      const student = await tx.student.create({
        data: {
          instituteId,
          studentCode,
          enquiryId: enquiry?.id,
          courseId: body.courseId,
          name: body.name,
          email,
          phone: body.phone,
          parentPhone: body.parentPhone,
          dob: body.dob,
          fatherName: body.fatherName,
          motherName: body.motherName,
          school: body.school,
          admissionDate: body.admissionDate,
          fingerprintId: body.fingerprintId,
        },
      });

      if (batch) {
        await tx.studentBatch.create({
          data: { studentId: student.id, batchId: batch.id, joinedAt: body.admissionDate },
        });
      }

      if (enquiry) {
        await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: "CONVERTED" } });
        await tx.enquiryActivity.create({
          data: { enquiryId: enquiry.id, type: "CONVERTED", createdByName: req.user!.fullName },
        });
      }

      return student;
    });

    await auditLog({
      action: "STUDENT_CREATED",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "Student",
      targetId: result.id,
      metadata: { studentCode: result.studentCode, enquiryId: enquiry?.id },
    });

    if (enquiry) {
      await auditLog({
        action: "ENQUIRY_CONVERTED",
        instituteId,
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        targetType: "Enquiry",
        targetId: enquiry.id,
        metadata: { studentId: result.id },
      });
    }

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
