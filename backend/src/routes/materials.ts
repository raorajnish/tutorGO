import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { notifyBatch } from "../services/studentNotify.js";

export const materialsRouter = Router();

materialsRouter.use(authenticate, requireInstitute);

const createMaterialSchema = z.object({
  courseId: z.string().optional(),
  batchId: z.string().optional(),
  subjectId: z.string().optional(),
  lectureId: z.string().optional(),
  title: z.string().min(1, "Title is required").max(120, "Title cannot exceed 120 characters"),
  description: z.string().max(2000, "Description cannot exceed 2000 characters").optional(),
  kind: z.enum(["FILE", "LINK", "HOMEWORK"]),
  assetUrl: z.string().url("Invalid file URL").optional().or(z.literal("")),
  assetName: z.string().optional(),
  externalUrl: z.string().url("Invalid link URL").optional().or(z.literal("")),
  dueDate: z.string().optional(),
});

// GET /materials - List materials with optional filters
materialsRouter.get("/", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const { courseId, batchId, subjectId, lectureId, kind } = req.query;

    const where: any = { instituteId };

    if (typeof courseId === "string" && courseId.trim()) {
      where.courseId = courseId;
    }

    if (typeof batchId === "string" && batchId.trim()) {
      where.OR = [
        { batchId },
        { batchId: null },
      ];
    }

    if (typeof subjectId === "string" && subjectId.trim()) {
      where.subjectId = subjectId;
    }

    if (typeof lectureId === "string" && lectureId.trim()) {
      where.lectureId = lectureId;
    }

    if (typeof kind === "string" && ["FILE", "LINK", "HOMEWORK"].includes(kind)) {
      where.kind = kind;
    }

    const items = await prisma.studyResource.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        course: { select: { id: true, name: true, code: true } },
        batch: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        lecture: { select: { id: true, date: true, startTime: true, endTime: true } },
        uploadedBy: { select: { id: true, fullName: true, role: true } },
      },
    });

    res.json(items);
  } catch (err) {
    next(err);
  }
});

// POST /materials - Create material or assign homework
materialsRouter.post(
  "/",
  requireRoles("OWNER", "ADMIN", "RECEPTION", "FACULTY"),
  validateBody(createMaterialSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof createMaterialSchema>;

      let resolvedCourseId = body.courseId;
      let batchName = "";

      if (body.batchId) {
        const batch = await prisma.batch.findUnique({
          where: { id: body.batchId },
          select: { id: true, name: true, courseId: true, instituteId: true },
        });

        if (!batch || batch.instituteId !== instituteId) {
          throw ApiError.badRequest("Selected batch not found");
        }
        resolvedCourseId = batch.courseId;
        batchName = batch.name;
      }

      if (!resolvedCourseId) {
        throw ApiError.badRequest("Either Course or Batch must be selected");
      }

      const material = await prisma.studyResource.create({
        data: {
          instituteId,
          courseId: resolvedCourseId,
          batchId: body.batchId || null,
          subjectId: body.subjectId || null,
          lectureId: body.lectureId || null,
          title: body.title,
          description: body.description || null,
          kind: body.kind,
          assetUrl: body.assetUrl || null,
          assetName: body.assetName || null,
          externalUrl: body.externalUrl || null,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          uploadedByUserId: req.user!.id,
        },
        include: {
          course: { select: { id: true, name: true, code: true } },
          batch: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, fullName: true, role: true } },
        },
      });

      if (body.batchId) {
        const isHomework = body.kind === "HOMEWORK";
        const titleText = isHomework ? `New Homework: ${body.title}` : `New Study Material: ${body.title}`;
        
        notifyBatch({
          instituteId,
          batchId: body.batchId,
          type: "BATCH_ANNOUNCEMENT",
          title: titleText,
          vars: {
            batchName,
            title: titleText,
            announcementText: body.description || body.title,
          },
          metadata: { batchId: body.batchId, resourceId: material.id },
        }).catch((err) => {
          console.error("Failed to send material notification:", err);
        });
      }

      res.status(201).json(material);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /materials/:id - Delete material
materialsRouter.delete(
  "/:id",
  requireRoles("OWNER", "ADMIN", "RECEPTION", "FACULTY"),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const id = req.params.id as string;

      const item = await prisma.studyResource.findUnique({
        where: { id },
      });

      if (!item || item.instituteId !== instituteId) {
        throw ApiError.notFound("Resource not found");
      }

      if (req.user!.role === "FACULTY" && item.uploadedByUserId !== req.user!.id) {
        throw ApiError.forbidden("You can only delete resources created by yourself");
      }

      await prisma.studyResource.delete({
        where: { id },
      });

      res.json({ success: true, id });
    } catch (err) {
      next(err);
    }
  }
);
