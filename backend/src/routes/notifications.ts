import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null });
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/// Upserted on endpoint — re-subscribing (e.g. the browser rotated its push
/// endpoint) just updates the same row instead of accumulating duplicates.
notificationsRouter.post("/push-subscription", validateBody(pushSubscriptionSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof pushSubscriptionSchema>;
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { userId: req.user!.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: { userId: req.user!.id, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

notificationsRouter.post("/push-unsubscribe", validateBody(unsubscribeSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof unsubscribeSchema>;
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: req.user!.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

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
