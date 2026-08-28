"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InstallmentList } from "@/components/fees/InstallmentList";
import { SetupFeeAccountModal } from "@/components/fees/SetupFeeAccountModal";
import { RecordPaymentModal } from "@/components/fees/RecordPaymentModal";
import { VoidPaymentModal } from "@/components/fees/VoidPaymentModal";
import { ReceiptModal } from "@/components/fees/ReceiptModal";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import { FEE_PLAN_TYPE_LABELS, PAYMENT_MODE_LABELS, type FeeAccountResponse, type FeePayment } from "@/lib/types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STAT_TONE = {
  primary: "bg-secondary text-secondary-foreground",
  success: "bg-success-soft text-success",
  accent: "bg-accent/10 text-accent",
  warning: "bg-warning-soft text-warning",
} as const;

function StatTile({ label, value, tone }: { label: string; value: string; tone: keyof typeof STAT_TONE }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 ${STAT_TONE[tone]}`}>
      <p className="text-[11px] font-medium opacity-80 sm:text-xs">{label}</p>
      <p className="mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg">{value}</p>
    </div>
  );
}

interface Props {
  studentId: string | null;
  onClose: () => void;
}

export function FeeAccountModal({ studentId, onClose }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<FeeAccountResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<FeePayment | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  function load() {
    if (!studentId) return;
    apiFetch<FeeAccountResponse>(`/fees/accounts/${studentId}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this student's fee account."));
  }

  useEffect(() => {
    setData(null);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  // Voiding is temporarily disabled backend-side (fees.ts POST /payments/:id/void)
  // — a payment's carry-forward settlement can touch other installments
  // (grow/shrink/create/delete) that a void can't yet cleanly reverse. Hidden
  // here rather than left visible to just fail on click. See changes-phase8.md §8a.
  const canVoid = false;
  const account = data?.account;

  return (
    <Modal open={studentId !== null} onClose={onClose} title={data ? `Fees — ${data.student.name}` : "Fees"} width="xl">
      {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && !account && (
        <div className="space-y-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">This student doesn&apos;t have a fee account yet.</p>
          <Button onClick={() => setSetupOpen(true)}>Set up fee account</Button>
        </div>
      )}

      {data && account && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{FEE_PLAN_TYPE_LABELS[account.planType]}</Badge>
              {account.feeStructure && <Badge tone="neutral">{account.feeStructure.name}</Badge>}
              <Badge tone={account.status === "ACTIVE" ? "success" : "neutral"}>{account.status === "ACTIVE" ? "Active" : "Closed"}</Badge>
            </div>
            {account.planType === "RECURRING" && account.status === "ACTIVE" && (
              <button
                type="button"
                onClick={() => setCloseConfirmOpen(true)}
                className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Close account
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <StatTile label="Total due" value={formatMoney(account.totalDue)} tone="primary" />
            <StatTile label="Paid" value={formatMoney(account.totalPaid)} tone="success" />
            <StatTile label="Waived" value={formatMoney(account.totalWaived)} tone="accent" />
            <StatTile label="Balance" value={formatMoney(account.balance)} tone="warning" />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Installments</p>
            <InstallmentList
              studentId={account.studentId}
              installments={account.installments}
              canWaive={user?.role === "OWNER" || user?.role === "ADMIN"}
              canEditPlan={user?.role === "OWNER" || user?.role === "ADMIN"}
              onChanged={load}
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Payment history</p>
              <Button variant="secondary" onClick={() => setPaymentOpen(true)} disabled={Number(account.balance) <= 0}>
                Record payment
              </Button>
            </div>

            {/* Desktop / tablet: table */}
            <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Receipt</th>
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Amount</th>
                      <th className="px-4 py-2.5 font-medium">Mode</th>
                      <th className="px-4 py-2.5 font-medium">Recorded by</th>
                      {canVoid && <th className="px-4 py-2.5 text-right font-medium">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {account.payments.map((p) => (
                      <tr key={p.id} className={`border-b border-border last:border-0 ${p.voided ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 text-foreground">
                          <button
                            type="button"
                            onClick={() => setReceiptId(p.id)}
                            className={`hover:underline ${p.voided ? "line-through" : ""}`}
                          >
                            {p.receiptNumber}
                          </button>{" "}
                          {p.voided && <Badge tone="danger">Voided</Badge>}
                          <p className="text-xs text-muted-foreground">
                            {p.allocations.map((a) => `#${a.installmentSeq}`).join(", ")}
                          </p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">{fmtDate(p.paidOn)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">{formatMoney(p.amount)}</td>
                        <td className="px-4 py-3 text-foreground">{PAYMENT_MODE_LABELS[p.mode]}</td>
                        <td className="px-4 py-3 text-foreground">{p.createdByName ?? "—"}</td>
                        {canVoid && (
                          <td className="px-4 py-3 text-right">
                            {!p.voided && (
                              <button
                                type="button"
                                onClick={() => setVoidTarget(p)}
                                className="text-xs font-medium text-danger underline underline-offset-2 hover:text-danger/80"
                              >
                                Void
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                    {account.payments.length === 0 && (
                      <tr>
                        <td colSpan={canVoid ? 6 : 5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No payments recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile: cards */}
            <div className="space-y-2 sm:hidden">
              {account.payments.map((p) => (
                <div key={p.id} className={`rounded-xl border border-border p-3 ${p.voided ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptId(p.id)}
                      className={`text-sm font-medium text-foreground hover:underline ${p.voided ? "line-through" : ""}`}
                    >
                      {p.receiptNumber}
                    </button>
                    <span className="text-sm font-semibold text-foreground">{formatMoney(p.amount)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(p.paidOn)} · {PAYMENT_MODE_LABELS[p.mode]} · Applied to {p.allocations.map((a) => `#${a.installmentSeq}`).join(", ")}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{p.createdByName ?? "—"}</p>
                    <div className="flex items-center gap-2">
                      {p.voided && <Badge tone="danger">Voided</Badge>}
                      {canVoid && !p.voided && (
                        <button type="button" onClick={() => setVoidTarget(p)} className="text-xs font-medium text-danger underline underline-offset-2">
                          Void
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {account.payments.length === 0 && (
                <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {data && <SetupFeeAccountModal open={setupOpen} onClose={() => setSetupOpen(false)} onSaved={load} student={data.student} />}

      {studentId && account && (
        <RecordPaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          onSaved={load}
          studentId={studentId}
          remainingBalance={account.balance}
        />
      )}

      <VoidPaymentModal payment={voidTarget} onClose={() => setVoidTarget(null)} onVoided={load} />

      <ReceiptModal paymentId={receiptId} onClose={() => setReceiptId(null)} />

      <ConfirmModal
        open={closeConfirmOpen}
        onClose={() => setCloseConfirmOpen(false)}
        onConfirm={async () => {
          if (!studentId) return;
          await apiFetch(`/fees/accounts/${studentId}/close`, { method: "POST" });
          load();
        }}
        title="Close this fee account?"
        description="No further monthly installments will be generated. Existing installments and payment history are kept."
        confirmLabel="Close account"
      />
    </Modal>
  );
}
