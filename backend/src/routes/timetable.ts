import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { toTimeDate, toTimeString, timeSchema } from "../lib/lectureShared.js";
import { addDays, toDateOnly, todayDateOnly } from "../lib/dateOnly.js";

export const timetableRouter = Router();

timetableRouter.use(authenticate, requireInstitute, requireModule("ATTENDANCE"));

const MANAGE_ROLES = ["OWNER", "ADMIN", "RECEPTION"] as const;
const SCHEDULE_ROLES = ["OWNER", "ADMIN", "RECEPTION", "FACULTY"] as const;

const DAY_OF_WEEK_ENUM = z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);

const slotInclude = {
  batch: { include: { course: { select: { id: true, name: true, code: true } } } },
  subject: { select: { id: true, name: true, shortCode: true } },
  faculty: { select: { id: true, fullName: true } },
  room: { select: { id: true, name: true, code: true, capacity: true, building: true } },
} as const;

function serializeSlot(slot: {
  id: string;
  dayOfWeek: string;
  startTime: Date;
  endTime: Date;
  isActive: boolean;
  batch: { id: string; name: string; course: { id: string; name: string; code: string } };
  subject: { id: string; name: string; shortCode: string };
  faculty: { id: string; fullName: string };
  room?: { id: string; name: string; code: string | null; capacity: number | null; building: string | null } | null;
}) {
  return {
    id: slot.id,
    dayOfWeek: slot.dayOfWeek,
    startTime: toTimeString(slot.startTime),
    endTime: toTimeString(slot.endTime),
    isActive: slot.isActive,
    batch: { id: slot.batch.id, name: slot.batch.name, course: slot.batch.course },
    subject: { id: slot.subject.id, name: slot.subject.name, shortCode: slot.subject.shortCode },
    faculty: slot.faculty,
    room: slot.room ? { id: slot.room.id, name: slot.room.name, code: slot.room.code, capacity: slot.room.capacity, building: slot.room.building } : null,
  };
}

async function checkSlotClashes(
  instituteId: string,
  dayOfWeek: "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY",
  startTime: string,
  endTime: string,
  batchId: string,
  facultyId: string,
  roomId?: string | null,
  excludeSlotId?: string
) {
  const startDt = toTimeDate(startTime);
  const endDt = toTimeDate(endTime);

  const existingSlots = await prisma.timetableSlot.findMany({
    where: {
      instituteId,
      dayOfWeek,
      isActive: true,
      id: excludeSlotId ? { not: excludeSlotId } : undefined,
      startTime: { lt: endDt },
      endTime: { gt: startDt },
    },
    include: slotInclude,
  });

  for (const s of existingSlots) {
    if (s.batchId === batchId) {
      throw ApiError.conflict(
        `Batch "${s.batch.name}" is already scheduled for ${s.subject.name} on ${dayOfWeek}s from ${toTimeString(s.startTime)} to ${toTimeString(s.endTime)}.`
      );
    }
    if (s.facultyId === facultyId) {
      throw ApiError.conflict(
        `Faculty member ${s.faculty.fullName} is already teaching ${s.subject.name} (Batch "${s.batch.name}") on ${dayOfWeek}s from ${toTimeString(s.startTime)} to ${toTimeString(s.endTime)}.`
      );
    }
    if (roomId && s.roomId === roomId && s.room) {
      throw ApiError.conflict(
        `Room "${s.room.name}" is already reserved for ${s.batch.name} (${s.subject.name}) on ${dayOfWeek}s from ${toTimeString(s.startTime)} to ${toTimeString(s.endTime)}.`
      );
    }
  }
}

timetableRouter.get("/", requireRoles(...SCHEDULE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
    const facultyId = typeof req.query.facultyId === "string" ? req.query.facultyId : undefined;
    const roomId = typeof req.query.roomId === "string" ? req.query.roomId : undefined;
    const dayOfWeek = typeof req.query.dayOfWeek === "string" ? (req.query.dayOfWeek as any) : undefined;

    const slots = await prisma.timetableSlot.findMany({
      where: {
        instituteId,
        batchId,
        facultyId: req.user!.role === "FACULTY" ? req.user!.id : facultyId,
        roomId,
        dayOfWeek,
        isActive: true,
      },
      include: slotInclude,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });

    res.json(slots.map(serializeSlot));
  } catch (err) {
    next(err);
  }
});

const slotSchema = z.object({
  batchId: z.string().min(1, "Batch is required"),
  subjectId: z.string().min(1, "Subject is required"),
  facultyId: z.string().min(1, "Faculty is required"),
  roomId: z.string().optional().nullable(),
  dayOfWeek: DAY_OF_WEEK_ENUM,
  startTime: timeSchema,
  endTime: timeSchema,
});

timetableRouter.post("/", requireRoles(...MANAGE_ROLES), validateBody(slotSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof slotSchema>;

    if (body.endTime <= body.startTime) {
      throw ApiError.badRequest("End time must be after start time");
    }

    const batch = await prisma.batch.findUnique({ where: { id: body.batchId } });
    if (!batch || batch.instituteId !== instituteId) throw ApiError.badRequest("Batch not found");

    const subjectLink = await prisma.courseSubject.findUnique({
      where: { courseId_subjectId: { courseId: batch.courseId, subjectId: body.subjectId } },
    });
    if (!subjectLink) throw ApiError.badRequest("Selected subject is not linked to this batch's course");

    const faculty = await prisma.user.findUnique({ where: { id: body.facultyId } });
    if (!faculty || faculty.instituteId !== instituteId || faculty.role !== "FACULTY") {
      throw ApiError.badRequest("Faculty not found");
    }

    if (body.roomId) {
      const room = await prisma.room.findUnique({ where: { id: body.roomId } });
      if (!room || room.instituteId !== instituteId) throw ApiError.badRequest("Room not found");
    }

    await checkSlotClashes(instituteId, body.dayOfWeek, body.startTime, body.endTime, body.batchId, body.facultyId, body.roomId);

    const slot = await prisma.timetableSlot.create({
      data: {
        instituteId,
        batchId: body.batchId,
        subjectId: body.subjectId,
        facultyId: body.facultyId,
        roomId: body.roomId || null,
        dayOfWeek: body.dayOfWeek,
        startTime: toTimeDate(body.startTime),
        endTime: toTimeDate(body.endTime),
      },
      include: slotInclude,
    });

    res.status(201).json(serializeSlot(slot));
  } catch (err) {
    next(err);
  }
});

const updateSlotSchema = slotSchema.partial();

timetableRouter.patch("/:id", requireRoles(...MANAGE_ROLES), validateBody(updateSlotSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const id = req.params.id as string;
    const body = req.body as z.infer<typeof updateSlotSchema>;

    const slot = await prisma.timetableSlot.findUnique({ where: { id }, include: slotInclude });
    if (!slot || slot.instituteId !== instituteId) throw ApiError.notFound("Timetable slot not found");

    const resolvedBatchId = body.batchId ?? slot.batchId;
    const resolvedSubjectId = body.subjectId ?? slot.subjectId;
    const resolvedFacultyId = body.facultyId ?? slot.facultyId;
    const resolvedRoomId = body.roomId !== undefined ? (body.roomId || null) : slot.roomId;
    const resolvedDayOfWeek = body.dayOfWeek ?? slot.dayOfWeek;
    const resolvedStartTime = body.startTime ?? toTimeString(slot.startTime);
    const resolvedEndTime = body.endTime ?? toTimeString(slot.endTime);

    if (resolvedEndTime <= resolvedStartTime) {
      throw ApiError.badRequest("End time must be after start time");
    }

    await checkSlotClashes(
      instituteId,
      resolvedDayOfWeek,
      resolvedStartTime,
      resolvedEndTime,
      resolvedBatchId,
      resolvedFacultyId,
      resolvedRoomId,
      slot.id
    );

    const updated = await prisma.timetableSlot.update({
      where: { id },
      data: {
        batchId: body.batchId,
        subjectId: body.subjectId,
        facultyId: body.facultyId,
        roomId: body.roomId !== undefined ? (body.roomId || null) : undefined,
        dayOfWeek: body.dayOfWeek,
        startTime: body.startTime ? toTimeDate(body.startTime) : undefined,
        endTime: body.endTime ? toTimeDate(body.endTime) : undefined,
      },
      include: slotInclude,
    });

    res.json(serializeSlot(updated));
  } catch (err) {
    next(err);
  }
});

timetableRouter.delete("/:id", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const id = req.params.id as string;

    const slot = await prisma.timetableSlot.findUnique({ where: { id } });
    if (!slot || slot.instituteId !== instituteId) throw ApiError.notFound("Timetable slot not found");

    await prisma.timetableSlot.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

const generateSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  batchId: z.string().optional(),
});

/** Maps JS getDay() (0=Sunday, 1=Monday...) to DayOfWeek enum */
const DAY_ENUM_MAP: Record<number, "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY"> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

timetableRouter.post("/generate", requireRoles(...MANAGE_ROLES), validateBody(generateSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const { startDate, endDate, batchId } = req.body as z.infer<typeof generateSchema>;

    if (endDate < startDate) throw ApiError.badRequest("End date must be on or after start date");

    const slots = await prisma.timetableSlot.findMany({
      where: {
        instituteId,
        batchId: batchId || undefined,
        isActive: true,
      },
      include: slotInclude,
    });

    if (slots.length === 0) {
      return res.json({ createdCount: 0, skippedCount: 0, details: [], errors: [] });
    }

    let createdCount = 0;
    let skippedCount = 0;
    const details: string[] = [];

    let current = toDateOnly(startDate);
    const end = toDateOnly(endDate);

    while (current.getTime() <= end.getTime()) {
      const dayEnum = DAY_ENUM_MAP[current.getUTCDay()]!;
      const matchingSlots = slots.filter((s) => s.dayOfWeek === dayEnum);

      for (const slot of matchingSlots) {
        // Check for existing dated lecture or test on this date for room, faculty, or batch
        const startTimeDt = slot.startTime;
        const endTimeDt = slot.endTime;

        const clash = await prisma.lecture.findFirst({
          where: {
            instituteId,
            date: current,
            cancelledAt: null,
            startTime: { lt: endTimeDt },
            endTime: { gt: startTimeDt },
            OR: [
              { batchId: slot.batchId },
              { facultyId: slot.facultyId },
              ...(slot.roomId ? [{ roomId: slot.roomId }] : []),
            ],
          },
          include: {
            batch: { select: { name: true } },
            subject: { select: { name: true } },
            faculty: { select: { fullName: true } },
            room: { select: { name: true } },
          },
        });

        if (clash) {
          skippedCount++;
          details.push(
            `Skipped ${slot.batch.name} (${slot.subject.name}) on ${current.toISOString().slice(0, 10)}: clashes with existing session.`
          );
          continue;
        }

        await prisma.lecture.create({
          data: {
            instituteId,
            batchId: slot.batchId,
            subjectId: slot.subjectId,
            facultyId: slot.facultyId,
            roomId: slot.roomId || null,
            date: current,
            startTime: slot.startTime,
            endTime: slot.endTime,
          },
        });
        createdCount++;
      }

      current = addDays(current, 1);
    }

    res.json({ createdCount, skippedCount, details, errors: details });
  } catch (err) {
    next(err);
  }
});
