import { prisma } from "../lib/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";

interface AuditInput {
  action: string;
  organizationId?: string | null;
  instituteId?: string | null;
  userId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function auditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      organizationId: input.organizationId ?? null,
      instituteId: input.instituteId ?? null,
      userId: input.userId ?? null,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}
