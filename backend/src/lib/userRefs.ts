import { prisma } from "./prisma.js";

export async function loadUserRefs(userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
  return new Map(users.map((u) => [u.id, u]));
}
