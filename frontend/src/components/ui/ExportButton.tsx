"use client";

import { useState } from "react";
import { apiDownload, ApiClientError } from "@/lib/api";

interface Props {
  /** API path (relative to /api), query string included — e.g.
   * "/fees/payments/export.csv?search=..." */
  path: string;
  filename: string;
  /** Tooltip + accessible label. Shown on hover via the native `title`
   * attribute — this app has no Tooltip primitive, and one hover-text use
   * case isn't a reason to build one; a plain `title` is the right amount of
   * UI for "minimal export icon with tooltip instruction." */
  title: string;
  className?: string;
}

/** One shared download-arrow icon button for every CSV export in the app —
 * see changes-phase10.md §10.5. Minimal by design: icon only, no label text,
 * a spinning state while the request is in flight, and the error surfaces as
 * a native browser alert rather than needing its own inline error banner on
 * every page that uses it (a failed export is rare and not worth a layout
 * reservation on every call site). */
export function ExportButton({ path, filename, title, className = "" }: Props) {
  const [exporting, setExporting] = useState(false);

  async function handleClick() {
    setExporting(true);
    try {
      await apiDownload(path, filename);
    } catch (err) {
      window.alert(err instanceof ApiClientError ? err.message : "Could not export this.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={exporting}
      title={title}
      aria-label={title}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50 ${className}`}
    >
      {exporting ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
          <path d="M21 12a9 9 0 11-9-9" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 3v12" strokeLinecap="round" />
          <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 19h16" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
