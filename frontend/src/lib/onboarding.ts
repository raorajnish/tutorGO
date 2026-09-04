import type { MeResponse } from "./types";

/** Where a fully onboarded user of this role belongs. A student's home is
 * their own record, not the institute's dashboard — they have no access to
 * any part of that. */
export function homeRoute(user: MeResponse): string {
  return user.role === "STUDENT" ? "/portal" : "/dashboard";
}

/** Central gate order: password → institute details (ADMIN only) → welcome →
 * their home. Returning `homeRoute(user)` means "nothing left to do", which is
 * how callers tell an onboarding redirect apart from a normal landing. */
export function nextOnboardingRoute(user: MeResponse): string {
  if (user.mustChangePassword) return "/onboarding/password";
  if (user.role === "ADMIN" && user.institute && !user.institute.onboardingDone) return "/onboarding/institute-details";
  if (!user.termsAcceptedAt) return "/onboarding/welcome";
  return homeRoute(user);
}
