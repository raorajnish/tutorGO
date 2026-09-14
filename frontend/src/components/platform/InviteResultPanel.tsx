"use client";

import { CopyButton } from "@/components/ui/CopyButton";
import { Badge } from "@/components/ui/Badge";
import type { InviteResult } from "@/lib/types";

function CopyField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-sm text-foreground">{value}</p>
      </div>
      <CopyButton text={value} />
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
