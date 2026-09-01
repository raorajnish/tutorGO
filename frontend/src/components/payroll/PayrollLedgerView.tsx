"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { Textarea } from "@/components/ui/Textarea";
import { formatMoney, parseMoney } from "@/lib/money";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS, type PayrollLedger, type PayrollLineItem, type PaymentMode } from "@/lib/types";
import { todayInput } from "@/lib/format";

const STATUS_TONE = { PAID: "success", PARTIAL: "warning", UNPAID: "neutral" } as const;

function LineItemRow({ item, readOnly, checked, onToggle }: { item: PayrollLineItem; readOnly: boolean; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <label className="flex min-w-0 flex-1 items-center gap-2.5">
        {!readOnly && item.status !== "PAID" && (
          <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0 accent-accent" />
        )}
        {(readOnly || item.status === "PAID") && <span className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 truncate text-foreground">{item.label}</span>
      </label>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="tabular-nums text-foreground">{formatMoney(item.amount)}</span>
        <Badge tone={STATUS_TONE[item.status]}>
          {item.status === "PARTIAL" ? `Partial · ${formatMoney(item.paidAmount)} paid` : item.status === "PAID" ? "Paid" : "Unpaid"}
        </Badge>
      </div>
    </div>
  );
}

interface Props {
  ledger: PayrollLedger;
  readOnly?: boolean;
  submitting?: boolean;
  error?: string | null;
  onPay?: (payload: { lineItemIds: string[]; amount: number; mode: PaymentMode; paidOn: string; notes?: string; autoApplyCredit: boolean }) => void;
}

export function PayrollLedgerView({ ledger, readOnly = false, submitting = false, error, onPay }: Props) {
  const [openPeriods, setOpenPeriods] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("BANK_TRANSFER");
  const [paidOn, setPaidOn] = useState(todayInput());
  const [notes, setNotes] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [autoApplyCredit, setAutoApplyCredit] = useState(true);

  const allItems = useMemo(() => ledger.periods.flatMap((p) => p.lineItems), [ledger.periods]);

  // Default: every not-fully-paid item pre-selected, and its period open —
  // matches "everything owed, ready to pay unless you deselect it."
  useEffect(() => {
    const outstanding = allItems.filter((i) => i.status !== "PAID");
    setSelected(new Set(outstanding.map((i) => i.id)));
    setOpenPeriods(new Set(ledger.periods.filter((p) => Number(p.totalOutstanding) > 0).map((p) => p.periodMonth)));
    setAmountTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger.id, ledger.periods.length]);

  const selectedTotal = useMemo(
    () => allItems.filter((i) => selected.has(i.id)).reduce((sum, i) => sum + (parseMoney(i.amount) - parseMoney(i.paidAmount)), 0),
    [allItems, selected]
  );

  useEffect(() => {
    if (!amountTouched) setAmount(selectedTotal > 0 ? selectedTotal.toFixed(2) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTotal]);

  function togglePeriod(period: string) {
    setOpenPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const amountNum = Number(amount) || 0;
  const isCredit = amountNum > selectedTotal;
  const isShortfall = amountNum > 0 && amountNum < selectedTotal;

  const rate = ledger.salaryType === "PER_LECTURE" ? ledger.perLectureRate : ledger.monthlyRate;
  const rateLabel = ledger.salaryType === "PER_LECTURE" ? "Rate per lecture" : "Monthly rate";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={rateLabel} value={rate ? formatMoney(rate) : "—"} tone="primary" />
        {ledger.salaryType === "PER_LECTURE" && <StatCard label="Lectures taken" value={ledger.totals.lecturesCount} tone="accent" />}
        <StatCard label="Total earned" value={formatMoney(ledger.totals.totalEarned)} tone="accent" />
        <StatCard label="Total paid" value={formatMoney(ledger.totals.totalPaid)} tone="success" />
        <StatCard
          label={Number(ledger.totals.totalPending) < 0 ? "Credit" : "Pending"}
          value={formatMoney(Math.abs(Number(ledger.totals.totalPending)))}
          tone={Number(ledger.totals.totalPending) < 0 ? "success" : "warning"}
        />
      </div>

      {Number(ledger.advanceBalance) > 0 && (
        <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success">
          Credit balance: {formatMoney(ledger.advanceBalance)} — will auto-apply to future dues.
        </div>
      )}

      <div className="space-y-2">
        {ledger.periods.map((period) => {
          const open = openPeriods.has(period.periodMonth);
          return (
            <div key={period.periodMonth} className="overflow-hidden rounded-xl border border-border">
              <button
                type="button"
                onClick={() => togglePeriod(period.periodMonth)}
                className="flex w-full items-center justify-between gap-3 bg-muted px-4 py-3 text-left transition-colors hover:bg-secondary"
              >
                <span className="flex items-center gap-2">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-90" : ""}`}
                  >
                    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="text-sm font-semibold text-foreground">{period.label}</span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <span className="tabular-nums text-foreground">{formatMoney(period.totalAmount)}</span>
                  {Number(period.totalOutstanding) > 0 ? (
                    <Badge tone="warning">{formatMoney(period.totalOutstanding)} due</Badge>
                  ) : (
                    <Badge tone="success">Paid</Badge>
                  )}
                </span>
              </button>
              {open && (
                <div className="divide-y divide-border">
                  {period.lineItems.map((item) => (
                    <LineItemRow key={item.id} item={item} readOnly={readOnly} checked={selected.has(item.id)} onToggle={() => toggleItem(item.id)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {ledger.periods.length === 0 && (
          <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">Nothing generated yet.</p>
        )}
      </div>

      {!readOnly && onPay && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Selected total</span>
            <span className="font-semibold text-foreground">{formatMoney(selectedTotal)}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Amount to pay (₹)"
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => {
                setAmountTouched(true);
                setAmount(e.target.value);
              }}
            />
            <Dropdown label="Mode" value={mode} onChange={(v) => setMode(v as PaymentMode)} options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
            <Input label="Paid on" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </div>

          {isCredit && (
            <div className="space-y-2 rounded-lg bg-muted px-3 py-2.5">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={autoApplyCredit}
                  onChange={(e) => setAutoApplyCredit(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Auto-apply excess as credit
              </label>
              <p className="text-xs text-muted-foreground">
                {autoApplyCredit
                  ? `${formatMoney(amountNum - selectedTotal)} more than the selected items — the extra becomes a credit balance, auto-applied to future dues.`
                  : `Only ${formatMoney(Math.min(amountNum, selectedTotal))} of ${formatMoney(amountNum)} can be applied to the selected items — turn this on to carry the rest forward instead, or select more items / lower the amount.`}
              </p>
            </div>
          )}
          {isShortfall && <p className="text-xs text-warning">Covers only part of the selected items — the rest stays outstanding and payable later.</p>}

          <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />

          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

          <div className="flex justify-end">
            <Button
              onClick={() =>
                onPay({ lineItemIds: [...selected], amount: amountNum, mode, paidOn, notes: notes || undefined, autoApplyCredit })
              }
              disabled={submitting || amountNum <= 0 || (isCredit && !autoApplyCredit)}
            >
              {submitting ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
