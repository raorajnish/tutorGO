"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, readStoredMaintenanceDetails, ApiClientError } from "@/lib/api";

function formatEndAt(endAt: string): string {
  return new Date(endAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/// Landed on via the redirect in lib/api.ts the moment any request comes back
/// MAINTENANCE_ACTIVE (backend/src/middleware/auth.ts). The window's details
/// were stashed in sessionStorage by that same redirect, so this page can
/// render them without a request that would just 503 again. "Try again"
/// calls /auth/me directly (unaffected by the redirect logic) to check
/// whether the window has since ended or been cancelled.
export default function MaintenancePage() {
  const router = useRouter();
  const [details, setDetails] = useState(readStoredMaintenanceDetails());
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!details) {
      // Reached directly (bookmarked, shared link) with nothing stashed —
      // check once so the page still says something useful.
      void checkStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkStatus() {
    setChecking(true);
    try {
      await apiFetch("/auth/me");
      // No longer blocked — send them back in.
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "MAINTENANCE_ACTIVE") {
        setDetails(readStoredMaintenanceDetails());
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="tg-mesh relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/10" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/5" aria-hidden="true" />

      <div className="relative w-full max-w-md text-center">
        <p className="text-[5rem] leading-none sm:text-[6rem]" aria-hidden>🛠️</p>
        <h1 className="font-display mt-2 text-xl font-semibold text-primary-foreground sm:text-2xl">
          {details?.scope === "GLOBAL" ? "We're doing scheduled maintenance" : "This institute is under maintenance"}
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-primary-foreground/70">
          {details?.message || "We're back shortly — thanks for your patience."}
        </p>
        {details?.endAt && (
          <p className="mt-1 text-sm text-primary-foreground/60">
            Expected back around {formatEndAt(details.endAt)}
          </p>
        )}
        <button
          type="button"
          onClick={checkStatus}
          disabled={checking}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-card/15 px-5 py-2.5 text-sm font-medium text-primary-foreground backdrop-blur-sm transition-colors hover:bg-card/25 disabled:opacity-60"
        >
          {checking ? "Checking…" : "Try again"}
        </button>
      </div>
    </div>
  );
}
