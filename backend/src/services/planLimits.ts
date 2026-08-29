import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { effectiveLimits, ROLE_LABEL, type CappedRole, type RoleLimits } from "../lib/instituteLimits.js";

export type { CappedRole };

/** Current active headcount per capped role. STUDENT deliberately comes from
 * the Student table — students never get a User row (changes.md §1), so
 * counting them via User silently reports 0 forever. */
export async function countUsage(instituteId: string): Promise<RoleLimits> {
  const [roleCounts, studentCount] = await Promise.all([
    prisma.user.groupBy({
      by: ["role"],
      where: { instituteId, isActive: true, role: { in: ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"] } },
      _count: { _all: true },
    }),
    prisma.student.count({ where: { instituteId, isActive: true } }),
  ]);

  const byRole = Object.fromEntries(roleCounts.map((r) => [r.role, r._count._all]));
  return {
    ADMIN: byRole.ADMIN ?? 0,
    ACCOUNTANT: byRole.ACCOUNTANT ?? 0,
    FACULTY: byRole.FACULTY ?? 0,
    RECEPTION: byRole.RECEPTION ?? 0,
    STUDENT: studentCount,
  };
}

/** Throws 409 PLAN_LIMIT_REACHED if adding one more active user of this role would exceed the institute's limits. */
export async function assertRoleCapacity(instituteId: string, role: CappedRole): Promise<void> {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId }, include: { plan: true } });
  if (!institute) throw ApiError.notFound("Institute not found");

  // Enforces the institute's own snapshot, falling back to the plan only for
  // institutes that predate it — see lib/instituteLimits.ts. Null means no
  // plan and no snapshot, which stays unlimited rather than blocking.
  const limits = effectiveLimits(institute);
  if (!limits) return;
  const max = limits[role];

  // Students never get a User row (login is deferred — see changes.md §1),
  // so their headcount comes from the Student table, not User.
  const current =
    role === "STUDENT"
      ? await prisma.student.count({ where: { instituteId, isActive: true } })
      : await prisma.user.count({ where: { instituteId, role, isActive: true } });

  if (current >= max) {
    const planName = institute.plan?.name ?? "current";
    throw new ApiError(
      409,
      "PLAN_LIMIT_REACHED",
      `The ${planName} plan allows up to ${max} ${ROLE_LABEL[role]}${max === 1 ? "" : "s"} for this institute — it is already at that limit.`
    );
  }
}
