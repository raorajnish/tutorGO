"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { InviteResult } from "@/lib/types";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — no-op
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm text-foreground">{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {copied ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15V5a2 2 0 012-2h10" />
            </svg>
            Copy
          </>
        )}
      </button>
    </div>
  );
}

export function InviteResultPanel({ label, result }: { label: string; result: InviteResult }) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted p-3.5">
      <div className="flex items-center gap-2">
        <Badge tone="primary">{label}</Badge>
        {result.emailDelivered ? (
          <span className="text-xs text-success">Invite email sent.</span>
        ) : (
          <span className="text-xs text-warning">Email not sent{result.error ? ` — ${result.error}` : ""}</span>
        )}
      </div>

      <div className="space-y-2.5 rounded-lg border border-border bg-card p-3">
        <CopyField label="Invite link" value={result.loginUrl} />
        <CopyField label="Email" value={result.email} />
        <CopyField label="Temporary password" value={result.tempPassword} />
      </div>
    </div>
  );
}
