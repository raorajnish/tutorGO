import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const roomsRouter = Router();

roomsRouter.use(authenticate, requireInstitute, requireModule("ATTENDANCE"));

const MANAGE_ROLES = ["OWNER", "ADMIN", "RECEPTION"] as const;
const READ_ROLES = ["OWNER", "ADMIN", "RECEPTION", "FACULTY", "ACCOUNTANT"] as const;

const roomSchema = z.object({
  name: z.string().min(1, "Room name is required").max(100),
  code: z.string().max(30).optional().nullable(),
  capacity: z.coerce.number().int().min(1).optional().nullable(),
  building: z.string().max(100).optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateRoomSchema = roomSchema.partial();

roomsRouter.get("/", requireRoles(...READ_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const includeInactive = req.query.includeInactive === "true";

    const rooms = await prisma.room.findMany({
      where: {
        instituteId,
        isActive: includeInactive ? undefined : true,
      },
      orderBy: { name: "asc" },
    });

    res.json(rooms);
  } catch (err) {
    next(err);
  }
});

roomsRouter.post("/", requireRoles(...MANAGE_ROLES), validateBody(roomSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof roomSchema>;

    const existing = await prisma.room.findUnique({
      where: { instituteId_name: { instituteId, name: body.name.trim() } },
    });
    if (existing) {
      throw ApiError.conflict(`A room named "${body.name.trim()}" already exists in this institute.`);
    }

    const room = await prisma.room.create({
      data: {
        instituteId,
        name: body.name.trim(),
        code: body.code?.trim() || null,
        capacity: body.capacity ?? null,
        building: body.building?.trim() || null,
        isActive: body.isActive ?? true,
      },
    });

    res.status(201).json(room);
  } catch (err) {
    next(err);
  }
});

roomsRouter.patch("/:id", requireRoles(...MANAGE_ROLES), validateBody(updateRoomSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const id = req.params.id as string;
    const body = req.body as z.infer<typeof updateRoomSchema>;

    const room = await prisma.room.findUnique({ where: { id } });
    if (!room || room.instituteId !== instituteId) {
      throw ApiError.notFound("Room not found");
    }

    if (body.name && body.name.trim() !== room.name) {
      const clash = await prisma.room.findUnique({
        where: { instituteId_name: { instituteId, name: body.name.trim() } },
      });
      if (clash) {
        throw ApiError.conflict(`A room named "${body.name.trim()}" already exists.`);
      }
    }

    const updated = await prisma.room.update({
      where: { id },
      data: {
        name: body.name ? body.name.trim() : undefined,
        code: body.code !== undefined ? (body.code?.trim() || null) : undefined,
        capacity: body.capacity !== undefined ? body.capacity : undefined,
        building: body.building !== undefined ? (body.building?.trim() || null) : undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

roomsRouter.delete("/:id", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const id = req.params.id as string;

    const room = await prisma.room.findUnique({ where: { id } });
    if (!room || room.instituteId !== instituteId) {
      throw ApiError.notFound("Room not found");
    }

    const usedCount = await prisma.lecture.count({ where: { roomId: id } });
    const slotCount = await prisma.timetableSlot.count({ where: { roomId: id } });

    if (usedCount > 0 || slotCount > 0) {
      // Soft-delete by setting isActive = false if referenced in schedule history
      const deactivated = await prisma.room.update({
        where: { id },
        data: { isActive: false },
      });
      return res.json({ deactivated: true, room: deactivated });
    }

    await prisma.room.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
