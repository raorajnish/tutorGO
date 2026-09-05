"use client";

import { useAuth } from "@/lib/auth-context";
import { homeRoute } from "@/lib/onboarding";
import { StatusPage } from "@/components/errors/StatusPage";

/** Landing spot for RoleRoute when a signed-in user's role doesn't belong on
 * the page they navigated (or typed a URL) to — see RoleRoute.tsx. Reads the
 * current user directly rather than via a query param so "go to your
 * dashboard" always points at the right place for whoever is actually
 * looking at this page. */
export default function ForbiddenPage() {
  const { user } = useAuth();

  return (
    <StatusPage
      code="403"
      title="You don't have access to this page"
      description="Your account role doesn't include this section. If you think that's wrong, ask an admin at your institute."
      actionHref={user ? homeRoute(user) : "/login"}
      actionLabel={user ? "Go to your dashboard" : "Go to login"}
    />
  );
}
