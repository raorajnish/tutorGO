"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, ApiClientError } from "@/lib/api";
import type { FeeInstallment } from "@/lib/types";

interface Props {
  studentId: string;
  installment: FeeInstallment;
  onChanged: () => void;
}

/** Same small popover pattern as RescheduleControl — a single-field edit,
 * not a full modal. Server enforces the floor at paidAmount and blocks
 * paid/waived installments; this just mirrors that in the input's min. */
export function EditAmountControl({ studentId, installment, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [amount, setAmount] = useState(installment.amount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const amountBelowPaid = amount !== "" && Number(amount) < Number(installment.paidAmount);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.min(rect.left, window.innerWidth - 240), top: rect.bottom + 6 });
    setAmount(installment.amount);
  }, [open, installment.amount]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/fees/accounts/${studentId}/installments/${installment.id}/amount`, {
        method: "PATCH",
        body: JSON.stringify({ amount: Number(amount) }),
      });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this amount.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Edit amount"
        aria-label="Edit amount"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" strokeLinecap="round" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        mounted &&
        position &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", left: position.left, top: position.top, width: 220 }}
            className="z-100 space-y-2 rounded-xl border border-border bg-card p-3 shadow-(--shadow-overlay)"
          >
            <p className="text-xs font-medium text-foreground">New amount (₹)</p>
            <input
              type="number"
              min={Number(installment.paidAmount)}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {Number(installment.paidAmount) > 0 && (
              <p className={`text-xs ${amountBelowPaid ? "text-danger" : "text-muted-foreground"}`}>
                Can&apos;t go below ₹{installment.paidAmount} already paid
              </p>
            )}
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={busy || amountBelowPaid || !amount}
                className="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
