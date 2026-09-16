import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { notifyBatch } from "../services/studentNotify.js";

export const announcementsRouter = Router();

announcementsRouter.use(authenticate, requireInstitute, requireModule("ATTENDANCE"));

const BROADCAST_ROLES = ["OWNER", "ADMIN", "RECEPTION", "FACULTY"] as const;

const batchAnnouncementSchema = z.object({
  batchId: z.string().min(1, "Batch is required"),
  title: z.string().min(1, "Title is required").max(120, "Title cannot exceed 120 characters"),
  message: z.string().min(1, "Message is required").max(1000, "Message cannot exceed 1000 characters"),
});

announcementsRouter.post(
  "/batch",
  requireRoles(...BROADCAST_ROLES),
  validateBody(batchAnnouncementSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const { batchId, title, message } = req.body as z.infer<typeof batchAnnouncementSchema>;

      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        select: { id: true, name: true, courseId: true, instituteId: true },
      });

      if (!batch || batch.instituteId !== instituteId) {
        throw ApiError.badRequest("Batch not found");
      }

      if (req.user!.role === "FACULTY") {
        const facultyAssignment = await prisma.facultyAssignment.findFirst({
          where: { facultyId: req.user!.id, courseId: batch.courseId },
        });
        const timetableSlot = await prisma.timetableSlot.findFirst({
          where: { facultyId: req.user!.id, batchId, isActive: true },
        });
        const lecture = await prisma.lecture.findFirst({
          where: { facultyId: req.user!.id, batchId },
        });
        if (!facultyAssignment && !timetableSlot && !lecture) {
          throw ApiError.forbidden("You are not assigned to teach this batch");
        }
      }

      const { notified } = await notifyBatch({
        instituteId,
        batchId,
        type: "BATCH_ANNOUNCEMENT",
        title: `Announcement: ${title}`,
        vars: {
          batchName: batch.name,
          title,
          announcementText: message,
        },
        metadata: { batchId },
      });

      res.json({ success: true, notified, batchName: batch.name });
    } catch (err) {
      next(err);
    }
  }
);
