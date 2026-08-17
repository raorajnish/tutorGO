import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate } from "../middleware/auth.js";

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(
      notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata,
        read: n.readAt !== null,
        createdAt: n.createdAt,
      }))
    );
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/:id/read", async (req, res, next) => {
  try {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id as string } });
    if (!notification || notification.userId !== req.user!.id) throw ApiError.notFound("Notification not found");

    const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
    res.json({ id: updated.id, read: true });
  } catch (err) {
    next(err);
  }
});

notificationsRouter.post("/read-all", async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
