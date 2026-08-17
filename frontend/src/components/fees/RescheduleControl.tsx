"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, ApiClientError } from "@/lib/api";
import type { FeeInstallment } from "@/lib/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toInputDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  studentId: string;
  installment: FeeInstallment;
  onRescheduled: () => void;
}

/** Small date-picker popover for a single-field edit — not a full modal,
 * per the Fees addendum's UX plan. Portal-positioned like ActionMenu/Dropdown
 * so it's never clipped by a table's ancestor overflow. */
export function RescheduleControl({ studentId, installment, onRescheduled }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [date, setDate] = useState(() => toInputDate(installment.dueDate));
  const [cascade, setCascade] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const disabled = installment.status === "PAID" || installment.waived;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.min(rect.left, window.innerWidth - 260), top: rect.bottom + 6 });
  }, [open]);

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
      await apiFetch(`/fees/accounts/${studentId}/installments/${installment.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({ dueDate: date, cascade }),
      });
      setOpen(false);
      onRescheduled();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reschedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        title="Reschedule"
        aria-label="Reschedule"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 15l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open &&
        mounted &&
        position &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", left: position.left, top: position.top, width: 240 }}
            className="z-100 space-y-2 rounded-xl border border-border bg-card p-3 shadow-(--shadow-overlay)"
          >
            <p className="text-xs font-medium text-foreground">New due date</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} className="accent-primary" />
              Shift every later installment by the same amount
            </label>
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
                disabled={busy}
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
