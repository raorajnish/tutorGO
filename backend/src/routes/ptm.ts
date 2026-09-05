import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";
import { timeSchema, toTimeDate, toTimeString } from "../lib/lectureShared.js";
import { notifyBatch } from "../services/studentNotify.js";
import { renderMessageBody } from "../services/dispatch.js";

/**
 * Parent–teacher meetings, scheduled per batch (changes-phase11.md §11.2).
 *
 * One row per batch, never per course — two batches of the same standard
 * almost never share a time slot, so a single course-wide meeting would be
 * wrong for most of the people it notifies. Scheduling a whole standard's PTM
 * is the bulk-create endpoint below writing one row per selected batch; each
 * row stays independently reschedulable and cancellable.
 *
 * Not module-gated — same reasoning as Distribution: a small always-on
 * utility, not a billable subscription tier.
 */
export const ptmRouter = Router();

ptmRouter.use(authenticate, requireInstitute);

// Scheduling a PTM is the same class of work as scheduling a lecture —
// RECEPTION included, same as attendance.ts's SCHEDULE_ROLES.
const MANAGE_ROLES = ["OWNER", "ADMIN", "RECEPTION"] as const;

const meetingInclude = {
  course: { select: { id: true, name: true, code: true } },
  batch: { select: { id: true, name: true } },
} as const;

function serializeMeeting(m: {
  id: string;
  title: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  venue: string | null;
  note: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  course: { id: string; name: string; code: string };
  batch: { id: string; name: string };
}) {
  return {
    id: m.id,
    title: m.title,
    date: m.date,
    startTime: toTimeString(m.startTime),
    endTime: toTimeString(m.endTime),
    venue: m.venue,
    note: m.note,
    cancelled: m.cancelledAt !== null,
    cancelReason: m.cancelReason,
    course: m.course,
    batch: m.batch,
  };
}

async function loadMeeting(id: string, instituteId: string) {
  const meeting = await prisma.parentMeeting.findUnique({ where: { id }, include: meetingInclude });
  if (!meeting || meeting.instituteId !== instituteId) throw ApiError.notFound("Meeting not found");
  return meeting;
}

interface MeetingLike {
  id: string;
  title: string;
  instituteId: string;
  batchId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  venue?: string | null;
  cancelReason: string | null;
  course: { name: string };
  batch: { name: string };
}

/** The one place PTM_SCHEDULED/PTM_CANCELLED template variables are built —
 * every route that renders one of these bodies (create, /message, send-now)
 * calls this rather than building its own vars object, which is what let the
 * three drift out of sync the first time (one included `venue`, two didn't,
 * so the copy-box showed a literal unrendered "{{venue}}"). */
function meetingVars(meeting: MeetingLike): Record<string, string> {
  return {
    title: meeting.title,
    batch: meeting.batch.name,
    course: meeting.course.name,
    date: meeting.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    startTime: toTimeString(meeting.startTime),
    endTime: toTimeString(meeting.endTime),
    // Rendered with its own leading separator so the template can simply
    // append {{venue}} and get either " · Room 204" or nothing.
    venue: meeting.venue ? ` · ${meeting.venue}` : "",
    cancelReason: meeting.cancelReason ?? "",
  };
}

/** Fans a PTM event out to a batch's students/parents — in-app for students
 * with a working portal login, WhatsApp otherwise/also. Mirrors
 * routes/attendance.ts's notifyLecture for LECTURE_SCHEDULED/CANCELLED. */
async function notifyMeeting(meeting: MeetingLike, type: "PTM_SCHEDULED" | "PTM_CANCELLED", titlePrefix: string) {
  await notifyBatch({
    instituteId: meeting.instituteId,
    batchId: meeting.batchId,
    type,
    title: `${titlePrefix} — ${meeting.title}`,
    vars: meetingVars(meeting),
    metadata: { meetingId: meeting.id },
  });
}

// ---------------------------------------------------------------------------
// List / read
// ---------------------------------------------------------------------------

ptmRouter.get("/", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const scope = req.query.scope === "past" ? "past" : "upcoming";
    const today = new Date(new Date().toISOString().slice(0, 10));

    const meetings = await prisma.parentMeeting.findMany({
      where: { instituteId, date: scope === "past" ? { lt: today } : { gte: today } },
      include: meetingInclude,
      orderBy: [{ date: scope === "past" ? "desc" : "asc" }, { startTime: "asc" }],
      take: 200,
    });

    res.json(meetings.map(serializeMeeting));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Create — one row per selected batch, all-or-nothing per batch (a bad
// batchId in the list must not silently drop the others, so every batch is
// validated up front before anything is written).
// ---------------------------------------------------------------------------

const perBatchSchema = z.object({
  batchId: z.string().min(1),
  date: z.coerce.date(),
  startTime: timeSchema,
  endTime: timeSchema,
  venue: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

const createMeetingSchema = z.object({
  title: z.string().min(1, "Title is required").max(150),
  courseId: z.string().min(1, "Course is required"),
  meetings: z.array(perBatchSchema).min(1, "Schedule at least one batch"),
});

ptmRouter.post("/", requireRoles(...MANAGE_ROLES), validateBody(createMeetingSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createMeetingSchema>;
    const instituteId = req.tenantId!;

    const course = await prisma.course.findUnique({ where: { id: body.courseId } });
    if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");

    for (const m of body.meetings) {
      if (toTimeDate(m.endTime) <= toTimeDate(m.startTime)) {
        throw ApiError.badRequest("End time must be after start time for every batch scheduled.");
      }
    }

    const batchIds = body.meetings.map((m) => m.batchId);
    const batches = await prisma.batch.findMany({ where: { id: { in: batchIds }, courseId: body.courseId, instituteId } });
    if (batches.length !== new Set(batchIds).size) {
      throw ApiError.badRequest("One or more batches were not found in this course.");
    }

    const created = await prisma.$transaction(
      body.meetings.map((m) =>
        prisma.parentMeeting.create({
          data: {
            instituteId,
            title: body.title,
            courseId: body.courseId,
            batchId: m.batchId,
            date: m.date,
            startTime: toTimeDate(m.startTime),
            endTime: toTimeDate(m.endTime),
            venue: m.venue,
            note: m.note,
            createdByUserId: req.user!.id,
          },
          include: meetingInclude,
        })
      )
    );

    await auditLog({
      action: "PTM_SCHEDULED",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "ParentMeeting",
      metadata: { title: body.title, courseId: body.courseId, batchCount: created.length },
    });

    // Best-effort, after the writes commit — a template hiccup must never
    // undo a meeting that was actually scheduled.
    for (const meeting of created) {
      await notifyMeeting(meeting, "PTM_SCHEDULED", "PTM scheduled").catch(() => {});
    }

    res.status(201).json(created.map(serializeMeeting));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Update one batch's meeting (reschedule)
// ---------------------------------------------------------------------------

const updateMeetingSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  date: z.coerce.date().optional(),
  startTime: timeSchema.optional(),
  endTime: timeSchema.optional(),
  venue: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

ptmRouter.patch("/:id", requireRoles(...MANAGE_ROLES), validateBody(updateMeetingSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateMeetingSchema>;
    const meeting = await loadMeeting(req.params.id as string, instituteId);
    if (meeting.cancelledAt) throw ApiError.badRequest("This meeting has been cancelled.");

    if (body.startTime && body.endTime && toTimeDate(body.endTime) <= toTimeDate(body.startTime)) {
      throw ApiError.badRequest("End time must be after start time");
    }

    const updated = await prisma.parentMeeting.update({
      where: { id: meeting.id },
      data: {
        title: body.title,
        date: body.date,
        startTime: body.startTime ? toTimeDate(body.startTime) : undefined,
        endTime: body.endTime ? toTimeDate(body.endTime) : undefined,
        venue: body.venue,
        note: body.note,
        // A reschedule un-fires the pre-meeting reminders so they can fire
        // again against the new time — otherwise moving a meeting forward
        // could mean the "1 day before" reminder never goes out again.
        dayBeforeRemindedAt: body.date || body.startTime ? null : undefined,
        hourBeforeRemindedAt: body.date || body.startTime ? null : undefined,
      },
      include: meetingInclude,
    });

    res.json(serializeMeeting(updated));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

const cancelSchema = z.object({
  reason: z.string().min(1, "A reason is required").max(300),
});

ptmRouter.post("/:id/cancel", requireRoles(...MANAGE_ROLES), validateBody(cancelSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof cancelSchema>;
    const meeting = await loadMeeting(req.params.id as string, instituteId);
    if (meeting.cancelledAt) throw ApiError.badRequest("This meeting is already cancelled.");

    const updated = await prisma.parentMeeting.update({
      where: { id: meeting.id },
      data: { cancelledAt: new Date(), cancelReason: body.reason },
      include: meetingInclude,
    });

    await notifyMeeting(updated, "PTM_CANCELLED", "PTM cancelled").catch(() => {});

    res.json(serializeMeeting(updated));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// The copy-to-clipboard message + Send-now
// ---------------------------------------------------------------------------

/** The same body a student would see, rendered from the institute's own
 * template — for the "copy to paste into your own WhatsApp group" box. Shown
 * by the frontend only while `now < endTime`, per the plan; enforced there
 * (a display concern) rather than here, so staff can still fetch the text to
 * proofread a meeting that's already started. */
ptmRouter.get("/:id/message", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const meeting = await loadMeeting(req.params.id as string, instituteId);

    const body = await renderMessageBody(instituteId, "PTM_SCHEDULED", meetingVars(meeting));

    res.json({ body });
  } catch (err) {
    next(err);
  }
});

ptmRouter.post("/:id/send-now", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const meeting = await loadMeeting(req.params.id as string, instituteId);
    if (meeting.cancelledAt) throw ApiError.badRequest("This meeting was cancelled.");

    const result = await notifyBatch({
      instituteId,
      batchId: meeting.batchId,
      type: "PTM_SCHEDULED",
      title: `PTM reminder — ${meeting.title}`,
      vars: meetingVars(meeting),
      metadata: { meetingId: meeting.id },
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});
