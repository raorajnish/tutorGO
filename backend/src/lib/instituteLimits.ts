export type CappedRole = "ADMIN" | "ACCOUNTANT" | "FACULTY" | "RECEPTION" | "STUDENT";

export const CAPPED_ROLES = ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION", "STUDENT"] as const;

export const ROLE_LABEL: Record<CappedRole, string> = {
  ADMIN: "admin",
  ACCOUNTANT: "accountant",
  FACULTY: "faculty member",
  RECEPTION: "reception user",
  STUDENT: "student",
};

export type RoleLimits = Record<CappedRole, number>;

interface PlanLimitFields {
  maxAdmins: number;
  maxAccountants: number;
  maxFaculty: number;
  maxReception: number;
  maxStudents: number;
}

interface InstituteLimitFields {
  maxAdmins: number | null;
  maxAccountants: number | null;
  maxFaculty: number | null;
  maxReception: number | null;
  maxStudents: number | null;
}

/** Turns a Plan row into the shape the rest of the app compares against. */
export function planLimits(plan: PlanLimitFields): RoleLimits {
  return {
    ADMIN: plan.maxAdmins,
    ACCOUNTANT: plan.maxAccountants,
    FACULTY: plan.maxFaculty,
    RECEPTION: plan.maxReception,
    STUDENT: plan.maxStudents,
  };
}

/**
 * The limits actually enforced for one institute.
 *
 * The institute's own snapshot wins whenever it exists — that is the whole
 * point of the snapshot: a Plan edit must not retroactively change what an
 * existing institute is allowed. The plan is consulted only as a fallback for
 * institutes that were assigned a plan before the snapshot columns existed.
 *
 * Returns null when there is nothing to enforce (no plan, no snapshot), which
 * callers treat as unlimited rather than as a block.
 */
export function effectiveLimits(
  institute: InstituteLimitFields & { plan?: PlanLimitFields | null }
): RoleLimits | null {
  const fallback = institute.plan ? planLimits(institute.plan) : null;

  const resolve = (own: number | null, role: CappedRole): number | null => own ?? fallback?.[role] ?? null;

  const limits = {
    ADMIN: resolve(institute.maxAdmins, "ADMIN"),
    ACCOUNTANT: resolve(institute.maxAccountants, "ACCOUNTANT"),
    FACULTY: resolve(institute.maxFaculty, "FACULTY"),
    RECEPTION: resolve(institute.maxReception, "RECEPTION"),
    STUDENT: resolve(institute.maxStudents, "STUDENT"),
  };

  if (CAPPED_ROLES.every((role) => limits[role] === null)) return null;

  // A partially-snapshotted institute (possible only mid-backfill) is treated
  // as unlimited on whatever is still missing, never as zero.
  return {
    ADMIN: limits.ADMIN ?? Number.MAX_SAFE_INTEGER,
    ACCOUNTANT: limits.ACCOUNTANT ?? Number.MAX_SAFE_INTEGER,
    FACULTY: limits.FACULTY ?? Number.MAX_SAFE_INTEGER,
    RECEPTION: limits.RECEPTION ?? Number.MAX_SAFE_INTEGER,
    STUDENT: limits.STUDENT ?? Number.MAX_SAFE_INTEGER,
  };
}

/** True when this institute's limits differ from the plan it sits on — the
 * platform UI shows a "customised" marker rather than implying the plan's
 * headline numbers are what's enforced. */
export function isCustomised(institute: InstituteLimitFields & { plan?: PlanLimitFields | null }): boolean {
  if (!institute.plan) return false;
  const effective = effectiveLimits(institute);
  if (!effective) return false;
  const base = planLimits(institute.plan);
  return CAPPED_ROLES.some((role) => effective[role] !== base[role]);
}
