import webpush from "web-push";
import { prisma } from "../lib/prisma.js";

let configured = false;

function ensureConfigured() {
  if (configured) return false;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushInput {
  userId: string;
  title: string;
  body: string;
}

/** Best-effort — a push failure must never break the caller's real action
 * (e.g. a reminder broadcast). The in-app Notification row is always the
 * reliable copy; this is just a nudge to go look at it. */
export async function sendPush(input: PushInput): Promise<void> {
  if (!ensureConfigured()) return; // VAPID keys not set — silently a no-op.

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: input.userId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: input.title, body: input.body })
        );
      } catch (err) {
        // 404/410 means the browser has unsubscribed on its end — the
        // subscription is dead and retrying it forever would be pointless.
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    })
  );
}
