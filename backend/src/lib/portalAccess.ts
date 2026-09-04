/**
 * Student-portal access status — derived, never stored.
 *
 * The whole of §10.6's access model reduces to one pure function over four
 * live facts: does a login exist, is it still enabled, which course was it
 * issued against, and does that course still grant portal access. Nothing is
 * persisted beyond `Student.userId` / `Student.portalIssuedForCourseId` and
 * `Course.portalEnabled`, on the same "derive, don't store" principle already
 * used for FeeInstallment and DistributionReceipt status.
 *
 * The reason it matters that this is derived rather than a column: a course's
 * portal flag can be toggled at any time, and (once a course-change mechanism
 * exists) a student can be moved between courses. A stored status enum would
 * be wrong the instant either happened, with nothing to notice it. This is
 * always right because it is recomputed from current facts every time —
 * including inside `authenticate`, which is what makes it an actual access
 * control and not just a label on a screen.
 *
 * Nothing here ever deletes or hides history. Attendance, test results and
 * fee records key off `studentId`, which never changes; losing portal access
 * only stops the login from authenticating.
 */

export type PortalAccessStatus =
  /// The student's current course doesn't grant portal access. Nothing to do
  /// here — the action is to enable the portal on the course, not on them.
  | "NOT_ELIGIBLE"
  /// Eligible, but has no working credential for their *current* enrollment:
  /// either no login was ever issued, or one was issued against a course they
  /// have since moved off. Staff action: send credentials.
  | "PENDING"
  /// Eligible, credential issued for the current course, login enabled.
  | "ACTIVE"
  /// Credential matches the current course, but the underlying login is
  /// disabled. Distinct from PENDING so the UI can say what's actually wrong
  /// rather than offering to re-send a credential that isn't the problem.
  | "SUSPENDED";

/** The minimum shape needed to derive status — deliberately structural so a
 * caller can pass any `select`ed subset without an intermediate mapping. */
export interface PortalAccessInput {
  courseId: string;
  userId: string | null;
  portalIssuedForCourseId: string | null;
  coursePortalEnabled: boolean;
  userIsActive: boolean | null;
}

export function derivePortalStatus(input: PortalAccessInput): PortalAccessStatus {
  if (!input.coursePortalEnabled) return "NOT_ELIGIBLE";
  if (!input.userId) return "PENDING";
  // Issued against a course the student is no longer on — the old credential
  // is deliberately treated as unusable until staff re-issue it for the new
  // enrollment, which is what "his details will be then for the next batch"
  // means in practice.
  if (input.portalIssuedForCourseId !== input.courseId) return "PENDING";
  if (input.userIsActive === false) return "SUSPENDED";
  return "ACTIVE";
}

/** True iff a login in this state should be allowed to authenticate. Used by
 * middleware/auth.ts on every request from a STUDENT — which is what makes
 * revocation immediate (no background job, no stored flag to fall stale). */
export function portalStatusAllowsLogin(status: PortalAccessStatus): boolean {
  return status === "ACTIVE";
}
