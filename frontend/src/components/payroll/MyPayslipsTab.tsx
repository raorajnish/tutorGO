"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { PayrollLedgerView } from "@/components/payroll/PayrollLedgerView";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import type { PayrollLedger } from "@/lib/types";

export function MyPayslipsTab() {
  const [ledger, setLedger] = useState<PayrollLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PayrollLedger>("/payroll/my-payslips")
      .then(setLedger)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load your payslips."));
  }, []);

  if (error) return <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>;
  if (!ledger) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonBlock key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (ledger.id === null) {
    return <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">No salary profile set up for you yet.</p>;
  }

  return <PayrollLedgerView ledger={ledger} readOnly />;
}
