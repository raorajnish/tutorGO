"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "./AppShell";
import { nextOnboardingRoute } from "@/lib/onboarding";

export function ProtectedShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    // SUPERADMIN is platform-seeded, not invited — skip the first-login gate.
    if (user.role === "SUPERADMIN") return;

    const target = nextOnboardingRoute(user);
    if (target !== "/dashboard") router.replace(target);
  }, [loading, user, router]);

  const needsOnboarding = user && user.role !== "SUPERADMIN" && nextOnboardingRoute(user) !== "/dashboard";

  if (loading || !user || needsOnboarding) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
