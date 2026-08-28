"use client";

import { useEffect, useState } from "react";
import { apiFetch, getToken } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import type { LedgerEntry, LedgerResponse } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

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
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  function load() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    apiFetch<LedgerResponse>(`/expenses/ledger?${params.toString()}`)
      .then(setLedger)
      .catch(() => setError("Could not load the ledger."));
  }

  useEffect(load, [from, to]);

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const token = getToken();
      const res = await fetch(`/api/expenses/ledger/export.csv?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ledger.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export the ledger.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-3">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button variant="secondary" onClick={exportCsv} disabled={exporting} className="w-full sm:w-auto">
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {ledger && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Income" value={`₹${ledger.summary.income}`} tone="success" />
          <StatCard label="Expense" value={`₹${ledger.summary.expense}`} tone="danger" />
          <StatCard label="Payroll" value={`₹${ledger.summary.payroll}`} tone="warning" />
          <StatCard label="Net" value={`₹${ledger.summary.net}`} tone="primary" />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
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
                  {KIND_SIGN[e.kind]}₹{e.amount}
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
    </div>
  );
}
