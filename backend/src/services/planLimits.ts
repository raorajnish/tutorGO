import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";

export type CappedRole = "ADMIN" | "ACCOUNTANT" | "FACULTY" | "RECEPTION" | "STUDENT";

const ROLE_LABEL: Record<CappedRole, string> = {
  ADMIN: "admin",
  ACCOUNTANT: "accountant",
  FACULTY: "faculty member",
  RECEPTION: "reception user",
  STUDENT: "student",
};

/** Throws 409 PLAN_LIMIT_REACHED if adding one more active user of this role would exceed the institute's plan. */
export async function assertRoleCapacity(instituteId: string, role: CappedRole): Promise<void> {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId }, include: { plan: true } });
  if (!institute) throw ApiError.notFound("Institute not found");
  if (!institute.plan) return; // No plan assigned — treat as unlimited rather than blocking.

  const max = {
    ADMIN: institute.plan.maxAdmins,
    ACCOUNTANT: institute.plan.maxAccountants,
    FACULTY: institute.plan.maxFaculty,
    RECEPTION: institute.plan.maxReception,
    STUDENT: institute.plan.maxStudents,
  }[role];

  // Students never get a User row (login is deferred — see changes.md §1),
  // so their headcount comes from the Student table, not User.
  const current =
    role === "STUDENT"
      ? await prisma.student.count({ where: { instituteId, isActive: true } })
      : await prisma.user.count({ where: { instituteId, role, isActive: true } });

  if (current >= max) {
    throw new ApiError(
      409,
      "PLAN_LIMIT_REACHED",
      `The ${institute.plan.name} plan allows up to ${max} ${ROLE_LABEL[role]}${max === 1 ? "" : "s"} per institute — this institute is already at that limit.`
    );
  }
}
