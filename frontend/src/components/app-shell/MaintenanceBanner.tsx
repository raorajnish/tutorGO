"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const DISMISS_KEY_PREFIX = "tutorgo_maintenance_dismissed_";

function formatWindow(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const sameDay = start.toDateString() === end.toDateString();
  const dateFmt: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const startStr = `${start.toLocaleDateString(undefined, dateFmt)}, ${start.toLocaleTimeString(undefined, timeFmt)}`;
  const endStr = sameDay
    ? end.toLocaleTimeString(undefined, timeFmt)
    : `${end.toLocaleDateString(undefined, dateFmt)}, ${end.toLocaleTimeString(undefined, timeFmt)}`;
  return `${startStr} – ${endStr}`;
}

function relativeCountdown(startAt: string, now: Date): string {
  const ms = new Date(startAt).getTime() - now.getTime();
  if (ms <= 0) return "shortly";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

/// Pre-start countdown for a scheduled maintenance window (changes-phase12.md
/// §12.11) — the once-a-window active check (MAINTENANCE_ACTIVE) already
/// redirects to /maintenance the moment it starts, so this only ever needs to
/// render the "upcoming" case. Dismissible per calendar day so it doesn't
/// nag on every page view once someone's seen it.
export function MaintenanceBanner() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const notice = user?.maintenance;
  const dismissKey = notice ? `${DISMISS_KEY_PREFIX}${notice.startAt}_${notice.endAt}` : null;

  useEffect(() => {
    if (!dismissKey) return;
    const stored = window.localStorage.getItem(dismissKey);
    const today = new Date().toDateString();
    setDismissed(stored === today);
  }, [dismissKey]);

  if (!notice || notice.status !== "upcoming" || dismissed) return null;

  function handleDismiss() {
    if (dismissKey) window.localStorage.setItem(dismissKey, new Date().toDateString());
    setDismissed(true);
  }

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
      <span aria-hidden>🛠️</span>
      <p className="min-w-0 flex-1">
        <span className="font-medium">
          {notice.scope === "GLOBAL" ? "Platform" : "This institute"} maintenance scheduled {relativeCountdown(notice.startAt, new Date())}
        </span>
        {" — "}
        {formatWindow(notice.startAt, notice.endAt)}
        {notice.message ? <span className="text-amber-800/80 dark:text-amber-300/80"> · {notice.message}</span> : null}
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded px-2 py-1 text-xs font-medium text-amber-900/70 hover:bg-amber-100 dark:text-amber-200/70 dark:hover:bg-amber-900/40"
      >
        Dismiss
      </button>
    </div>
  );
}
