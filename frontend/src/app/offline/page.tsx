/**
 * The service worker's navigation fallback (see public/sw.js) — shown only
 * when a page load genuinely can't reach the network and nothing cached
 * matches. Deliberately static (no client hooks, no API calls): if the
 * network is down, a page that tries to fetch anything just fails again.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 8.5a16.5 16.5 0 0120 0M5.5 12a11 11 0 0113 0M9 15.5a5.5 5.5 0 016 0" strokeLinecap="round" />
          <path d="M3 3l18 18" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="font-display text-lg font-semibold text-foreground">You&apos;re offline</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          TutorGO needs a connection to load your data. Reconnect and try again.
        </p>
      </div>
    </div>
  );
}
