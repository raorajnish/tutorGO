"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker unconditionally on every load (unlike
 * `lib/push.ts`'s `enablePush`, which only registers it when a user opts
 * into notifications) — installability and offline caching shouldn't depend
 * on push permission. Also watches for a new service worker taking over and
 * offers a one-tap reload, since a stale `sw.js` pinned on someone's phone
 * for weeks is the single easiest way for this to go wrong (see public/sw.js's
 * header). Mounted once, near the root — see layout.tsx.
 */
export function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    // A `controllerchange` fires once the new worker has taken control
    // (immediately here, since sw.js calls skipWaiting()+clients.claim()) —
    // reloading then is what actually puts the new code on screen. Guarded
    // so a second event mid-reload can't trigger a reload loop.
    function handleControllerChange() {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      // A worker already waiting (installed while this tab was closed) means
      // an update landed and is ready right now.
      if (registration.waiting) setUpdateReady(true);

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // "installed" + an existing controller means this is an update to
          // an already-running app, not the very first install — only the
          // former should prompt anyone.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateReady(true);
          }
        });
      });
    });

    return () => navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  }, []);

  async function handleReload() {
    const registration = await navigator.serviceWorker.getRegistration();
    // Tell the waiting worker to activate now rather than waiting for every
    // tab to close on its own — it calls skipWaiting() itself, which fires
    // the controllerchange listener above and reloads.
    registration?.waiting?.postMessage({ type: "SKIP_WAITING" });
  }

  if (!updateReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 shadow-(--shadow-overlay)">
        <p className="text-sm text-foreground">A new version is ready.</p>
        <button
          type="button"
          onClick={handleReload}
          className="cursor-pointer rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
