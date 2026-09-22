"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ExportButton } from "@/components/ui/ExportButton";
import { ReceiptModal } from "@/components/fees/ReceiptModal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { formatMoney } from "@/lib/money";
import { PAYMENT_MODE_LABELS, type ReceiptListItem } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";
import { Pagination, useClientPagination } from "@/components/ui/Pagination";

export function ReceiptsTab() {
  const [search, setSearch] = useState("");
  const [receipts, setReceipts] = useState<ReceiptListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  const receiptList = receipts ?? [];
  const { paginatedItems, paginationProps } = useClientPagination(receiptList, 10);

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
      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                placeholder="Search receipt no., student name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ExportButton
              path={`/fees/payments/export.csv${search ? `?search=${encodeURIComponent(search)}` : ""}`}
              filename="payments.csv"
              title="Export payment history as CSV"
            />
          </div>
        </div>
        <div className="hidden overflow-x-auto sm:block">
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
              {receipts === null &&
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={6}>
                      <SkeletonRow lines={2} />
                    </td>
                  </tr>
                ))}
              {receipts !== null && paginatedItems.map((r) => (
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

        <div className="divide-y divide-border sm:hidden">
          {receipts === null && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
          {receipts !== null && paginatedItems.map((r) => (
            <div key={r.id} onClick={() => setSelectedPaymentId(r.id)} className="space-y-2 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{r.receiptNumber}</p>
                  <p className="text-xs text-muted-foreground">{r.student.name} ({r.student.studentCode})</p>
                </div>
                {r.voided ? <Badge tone="danger">Void</Badge> : <Badge tone="success">Valid</Badge>}
              </div>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-[11px] text-muted-foreground">{PAYMENT_MODE_LABELS[r.mode]} · {fmtDate(r.paidOn)}</p>
                  <p className="font-semibold text-foreground">{formatMoney(r.amount)}</p>
                </div>
                <span className="text-xs font-medium text-accent hover:underline">View receipt →</span>
              </div>
            </div>
          ))}
          {receipts && receipts.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No receipts found.
            </div>
          )}
        </div>

        {receipts !== null && receipts.length > 0 && (
          <Pagination
            {...paginationProps}
            pageSizeOptions={[10, 20, 50]}
            className="border-t border-border bg-card/50"
          />
        )}
      </div>

      <ReceiptModal paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)} />
    </div>
  );
}
