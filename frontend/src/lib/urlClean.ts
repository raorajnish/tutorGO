/**
 * Silently removes quick-action modal query params (open, admit, collect, create)
 * from the browser address bar so page reloads don't re-trigger modals unexpectedly.
 */
export function clearQuickActionQuery() {
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of ["open", "admit", "collect", "create"]) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      const cleanPath = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") + url.hash;
      window.history.replaceState(null, "", cleanPath);
    }
  }
}
