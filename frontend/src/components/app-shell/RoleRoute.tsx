"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { homeRoute } from "@/lib/onboarding";
import type { Role } from "@/lib/types";

/**
 * Sends a signed-in user who doesn't belong on this route back to their own
 * home. The nav already hides what a role can't use and the API refuses it
 * regardless — this exists so a typed or bookmarked URL lands somewhere
 * sensible instead of rendering a page that will only ever show an error.
 */
export function RoleRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = !user || allow.includes(user.role);

  useEffect(() => {
    if (loading || !user || allowed) return;
    router.replace(homeRoute(user));
  }, [loading, user, allowed, router]);

  if (!allowed) return null;
  return <>{children}</>;
}
