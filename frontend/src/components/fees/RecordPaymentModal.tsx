"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Textarea";
import { formatMoney, parseMoney } from "@/lib/money";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/types";
import { todayInput, formatDate } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  studentId: string;
  /** Account's current balance (string money) — caps the amount client-side;
   * the server re-validates this regardless (never trusts client input). */
  remainingBalance: string;
}

/** A payment always closes exactly one installment — the earliest open one —
 * at exactly what was paid, whether that's less or more than its quoted
 * amount. The backend shifts the difference onto later installments: a
 * shortfall grows the next one (or creates one); an overpayment shrinks
 * later ones, removing any fully absorbed. See fees.ts POST /payments and
 * changes-phase8.md §8a. */
interface CarryForwardEntry {
  installmentId: string;
  seq: number;
  dueDate: string;
  amount: string;
  created: boolean;
  removed: boolean;
}

interface CarryForwardResult {
  direction: "shortfall" | "overpay";
  amount: string;
  entries: CarryForwardEntry[];
}

interface PaymentResponse {
  carryForward: CarryForwardResult | null;
}

export function RecordPaymentModal({ open, onClose, onSaved, studentId, remainingBalance }: Props) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("UPI");
  const [paidOn, setPaidOn] = useState(todayInput());
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [carryForwardNotice, setCarryForwardNotice] = useState<CarryForwardResult | null>(null);

  const remaining = parseMoney(remainingBalance);
  // Live, on-every-keystroke feedback — not just a submit-time check — so
  // the amount that would be rejected server-side is never a surprise.
  const amountError =
    amount !== "" && Number(amount) > remaining ? `Exceeds the remaining balance of ${formatMoney(remaining)}` : undefined;

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setMode("UPI");
    setPaidOn(todayInput());
    setNotes("");
    setError(null);
    setCarryForwardNotice(null);
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (amountError) {
      setError(amountError);
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiFetch<PaymentResponse>("/fees/payments", {
        method: "POST",
        body: JSON.stringify({
          studentId,
          amount: Number(amount),
          mode,
          paidOn,
          notes: notes || undefined,
        }),
      });
      onSaved();
      if (response.carryForward) {
        // Let staff see what happened before the modal disappears — closing
        // instantly would hide the one thing this toggle is for.
        setCarryForwardNotice(response.carryForward);
        setSubmitting(false);
        setTimeout(onClose, 2200);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not record this payment.");
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      description={`Remaining on this plan: ${formatMoney(remaining)}`}
      width="sm"
      footer={
        carryForwardNotice ? undefined : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="record-payment-form" disabled={submitting || !!amountError || !amount}>
              {submitting ? "Saving…" : "Record payment"}
            </Button>
          </>
        )
      }
    >
      {carryForwardNotice ? (
        <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-3 text-sm text-foreground">
          {carryForwardNotice.direction === "shortfall" ? (
            <>
              This payment didn&apos;t fully cover the installment it landed on. The remaining{" "}
              <strong>{formatMoney(parseMoney(carryForwardNotice.amount))}</strong> has been{" "}
              {carryForwardNotice.entries[0]!.created ? "added as a new installment" : "carried onto the next installment"} due{" "}
              {formatDate(carryForwardNotice.entries[0]!.dueDate)}.
            </>
          ) : (
            <>
              This payment covered more than the installment it landed on. The extra{" "}
              <strong>{formatMoney(parseMoney(carryForwardNotice.amount))}</strong> has been deducted from{" "}
              {carryForwardNotice.entries.length === 1
                ? "the next installment"
                : `${carryForwardNotice.entries.length} upcoming installments`}
              {carryForwardNotice.entries.some((e) => e.removed) ? " (one fully absorbed and removed)" : ""}.
            </>
          )}
        </div>
      ) : (
        <form id="record-payment-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Amount (₹)"
            type="number"
            min={0.01}
            max={remaining}
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={amountError}
          />
          <Dropdown
            label="Payment mode"
            value={mode}
            onChange={(v) => setMode(v as PaymentMode)}
            options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
          />
          <Input label="Paid on" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          <Textarea label="Notes (optional)" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
