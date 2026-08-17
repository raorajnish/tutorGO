import { prisma } from "../lib/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

interface CreateNotificationInput {
  instituteId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

/** Writes a real, persisted in-app notification — read by NotificationDrawer
 * via GET /notifications. Only meaningful for a user with a login; there is
 * no in-app channel for no-login external staff by construction (see
 * SalaryProfile.externalEmail for their fallback). */
export async function notify(input: CreateNotificationInput) {
  await prisma.notification.create({
    data: {
      instituteId: input.instituteId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
