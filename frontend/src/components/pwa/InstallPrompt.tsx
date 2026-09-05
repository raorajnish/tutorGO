"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";

const DISMISSED_KEY = "tutorgo_install_dismissed";

/** Chrome/Edge/Android fire this instead of letting the browser show its own
 * install UI, when the page is otherwise eligible (served over HTTPS, has a
 * valid manifest, has a registered service worker). Not a standard DOM type
 * yet in most TS lib versions, hence the local shape. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Add TutorGO to your home screen" bar.
 *
 * Shown to students by default — they're the phone-first audience the
 * portal and its push notifications are built for. Staff can still install
 * the app (nothing blocks it), they just aren't nudged toward it here.
 *
 * iOS Safari never fires `beforeinstallprompt` at all — there is no browser
 * API to detect or trigger its install flow, only the manual
 * Share → "Add to Home Screen" path. That's a platform limitation, not
 * something worth building a fake prompt around; this component simply does
 * nothing on iOS Safari, same as it does nothing on desktop Chrome.
 */
export function InstallPrompt() {
  const { user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      // Storage unavailable (private mode, blocked) — default to dismissed
      // rather than repeatedly prompting with no way to remember "no".
    }

    function handler(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function handleDismiss() {
    setDeferredPrompt(null);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Nothing to do if storage is blocked — the bar just reappears next
      // session, which is a minor annoyance, not a broken feature.
    }
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  if (!deferredPrompt || dismissed || user?.role !== "STUDENT") return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-(--shadow-overlay)">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="2" width="14" height="20" rx="2" />
            <path d="M12 18h.01" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">Add TutorGO to your home screen</p>
          <p className="text-xs text-muted-foreground">Quicker access, and fee/test reminders straight to your phone.</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={handleInstall}
            className="cursor-pointer rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Add
          </button>
          <button type="button" onClick={handleDismiss} className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
