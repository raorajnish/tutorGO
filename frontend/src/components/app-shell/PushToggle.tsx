"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushSubscription, pushSupported } from "@/lib/push";

/** A small opt-in row for browser push — separate from the in-app bell,
 * which always works regardless of this. Silently renders nothing on
 * browsers without push support (e.g. plain-tab iOS Safari). */
export function PushToggle() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(pushSupported());
    getPushSubscription().then((sub) => setSubscribed(!!sub));
  }, []);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
      } else {
        await enablePush();
        setSubscribed(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update notification settings.");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="border-b border-border px-5 py-3">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="flex w-full items-center justify-between gap-3 text-left text-sm transition-opacity disabled:opacity-60"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {subscribed ? "Push notifications on" : "Turn on push notifications"}
        </span>
        <span className={`font-medium ${subscribed ? "text-danger" : "text-accent"}`}>
          {busy ? "…" : subscribed ? "Turn off" : "Turn on"}
        </span>
      </button>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
