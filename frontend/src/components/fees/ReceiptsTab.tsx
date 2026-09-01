"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ReceiptModal } from "@/components/fees/ReceiptModal";
import { formatMoney } from "@/lib/money";
import { PAYMENT_MODE_LABELS, type ReceiptListItem } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

export function ReceiptsTab() {
  const [search, setSearch] = useState("");
  const [receipts, setReceipts] = useState<ReceiptListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  function load() {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    apiFetch<ReceiptListItem[]>(`/fees/payments?${qs.toString()}`)
      .then(setReceipts)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load receipts."));
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search receipt no., student name or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Receipt no.</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium">Paid on</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {(receipts ?? []).map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted"
                  onClick={() => setSelectedPaymentId(r.id)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">{r.receiptNumber}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.student.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.student.studentCode}
                      {r.student.phone ? ` · ${r.student.phone}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-foreground">{formatMoney(r.amount)}</td>
                  <td className="px-4 py-3 text-foreground">{PAYMENT_MODE_LABELS[r.mode]}</td>
                  <td className="px-4 py-3 text-foreground">{fmtDate(r.paidOn)}</td>
                  <td className="px-4 py-3">
                    {r.voided ? <Badge tone="danger">Void</Badge> : <Badge tone="success">Valid</Badge>}
                  </td>
                </tr>
              ))}
              {receipts && receipts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No receipts found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReceiptModal paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)} />
    </div>
  );
}
