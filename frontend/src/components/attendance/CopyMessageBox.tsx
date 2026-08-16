"use client";

import { useState } from "react";

export function CopyMessageBox({ message }: { message: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the text is
      // already visible in the preview below for manual copy.
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Ready to send on WhatsApp</p>
      <pre className="whitespace-pre-wrap rounded-xl border border-border bg-muted px-3.5 py-3 font-sans text-sm text-foreground">
        {message}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
          copied ? "bg-success-soft text-success" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
        }`}
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="11" height="11" rx="1.5" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {copied ? "Copied!" : "Copy message"}
      </button>
    </div>
  );
}
