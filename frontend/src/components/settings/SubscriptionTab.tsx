"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { CAPPED_ROLES, CAPPED_ROLE_LABELS, type InstitutePlanResponse } from "@/lib/types";

export function SubscriptionTab() {
  const [data, setData] = useState<InstitutePlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<InstitutePlanResponse>("/org/plan")
      .then(setData)
      .catch(() => setError("Could not load your plan."));
  }, []);

  if (error) {
    return <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!data.plan) {
    return <p className="text-sm text-muted-foreground">No plan assigned to this institute — headcount is unlimited.</p>;
  }

  const { plan } = data;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-(--shadow-card)">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-foreground">{plan.name}</p>
            {plan.description && <p className="mt-0.5 text-sm text-muted-foreground">{plan.description}</p>}
          </div>
          <Badge tone="primary">{plan.code}</Badge>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-foreground">Team headcount</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CAPPED_ROLES.map((role) => {
            const limit = plan.limits[role];
            const pct = limit.max > 0 ? Math.min(100, Math.round((limit.used / limit.max) * 100)) : 0;
            const atLimit = limit.used >= limit.max;
            return (
              <div key={role} className="rounded-md border border-border p-3">
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{CAPPED_ROLE_LABELS[role]}</span>
                  <span className={atLimit ? "text-warning" : "text-muted-foreground"}>
                    {limit.used} / {limit.max}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${atLimit ? "bg-warning" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Need a higher limit? Contact your platform administrator to upgrade this institute&apos;s plan.
      </p>
    </div>
  );
}
