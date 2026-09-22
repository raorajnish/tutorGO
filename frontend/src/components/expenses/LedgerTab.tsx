"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { ExportButton } from "@/components/ui/ExportButton";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import type { LedgerEntry, LedgerResponse } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { Pagination, useClientPagination } from "@/components/ui/Pagination";

const KIND_TONE: Record<LedgerEntry["kind"], "success" | "danger" | "warning"> = {
  INCOME: "success",
  EXPENSE: "danger",
  PAYROLL: "warning",
};

const KIND_LABEL: Record<LedgerEntry["kind"], string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  PAYROLL: "Payroll",
};

const KIND_SIGN: Record<LedgerEntry["kind"], "+" | "−"> = {
  INCOME: "+",
  EXPENSE: "−",
  PAYROLL: "−",
};

export function LedgerTab() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    apiFetch<LedgerResponse>(`/expenses/ledger?${params.toString()}`)
      .then(setLedger)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load the ledger."));
  }

  useEffect(load, [from, to]);

  const items = ledger?.entries ?? [];
  const { paginatedItems, paginationProps } = useClientPagination(items, 10);

  const exportQs = new URLSearchParams();
  if (from) exportQs.set("from", from);
  if (to) exportQs.set("to", to);
  const exportPath = `/expenses/ledger/export.csv${exportQs.toString() ? `?${exportQs.toString()}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="grid grid-cols-2 gap-2 flex-1 sm:flex sm:gap-3">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <ExportButton
          path={exportPath}
          filename="ledger.csv"
          title="Export ledger as CSV"
        />
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {ledger && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
          <StatCard label="Income" value={formatMoney(ledger.summary.income)} tone="success" />
          <StatCard label="Expense" value={formatMoney(ledger.summary.expense)} tone="danger" />
          <StatCard label="Payroll" value={formatMoney(ledger.summary.payroll)} tone="warning" />
          <StatCard label="Net" value={formatMoney(ledger.summary.net)} tone="primary" />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Description</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ledger?.entries.map((e) => (
                <tr key={`${e.kind}-${e.id}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(e.date)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground">{e.description}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-foreground">
                    {KIND_SIGN[e.kind]}{formatMoney(e.amount)}
                  </td>
                </tr>
              ))}
              {ledger && ledger.entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No activity in this range yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {ledger?.entries.map((e) => (
            <div key={`${e.kind}-${e.id}`} className="space-y-1.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{formatDate(e.date)}</span>
                <Badge tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Badge>
              </div>
              <p className="text-sm font-medium text-foreground">{e.description}</p>
              <div className="flex justify-end pt-1">
                <span className={`text-sm font-semibold ${e.kind === "INCOME" ? "text-success" : "text-foreground"}`}>
                  {KIND_SIGN[e.kind]}{formatMoney(e.amount)}
                </span>
              </div>
            </div>
          ))}
          {ledger && ledger.entries.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No activity in this range yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
