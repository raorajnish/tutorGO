import type { MeResponse } from "./types";

/** Central gate order: password → institute details (ADMIN only) → welcome → dashboard. */
export function nextOnboardingRoute(user: MeResponse): string {
  if (user.mustChangePassword) return "/onboarding/password";
  if (user.role === "ADMIN" && user.institute && !user.institute.onboardingDone) return "/onboarding/institute-details";
  if (!user.termsAcceptedAt) return "/onboarding/welcome";
  return "/dashboard";
}
