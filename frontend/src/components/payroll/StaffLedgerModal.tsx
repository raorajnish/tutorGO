"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { PayrollLedgerView } from "@/components/payroll/PayrollLedgerView";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { VoidPayrollPaymentModal } from "@/components/payroll/VoidPayrollPaymentModal";
import { PayslipModal } from "@/components/payroll/PayslipModal";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import { PAYMENT_MODE_LABELS, SALARY_TYPE_LABELS, type PayrollLedger, type PayrollPayment, type PaymentMode } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

interface Props {
  salaryProfileId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export function StaffLedgerModal({ salaryProfileId, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const canVoid = user?.role === "OWNER" || user?.role === "ADMIN";
  const [ledger, setLedger] = useState<PayrollLedger | null>(null);
  const [payments, setPayments] = useState<PayrollPayment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<PayrollPayment | null>(null);
  const [payslipTarget, setPayslipTarget] = useState<PayrollPayment | null>(null);

  function load() {
    if (!salaryProfileId) return;
    apiFetch<PayrollLedger>(`/payroll/staff/${salaryProfileId}/ledger`)
      .then(setLedger)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this staff member's ledger."));
    apiFetch<PayrollPayment[]>(`/payroll/pay?salaryProfileId=${salaryProfileId}`)
      .then(setPayments)
      .catch(() => setPayments([]));
  }

  useEffect(() => {
    setLedger(null);
    setPayments([]);
    setError(null);
    setPayError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salaryProfileId]);

  async function handlePay(payload: { lineItemIds: string[]; amount: number; mode: PaymentMode; paidOn: string; notes?: string; autoApplyCredit: boolean }) {
    if (!salaryProfileId) return;
    setPayError(null);
    setSubmitting(true);
    try {
      await apiFetch("/payroll/pay", { method: "POST", body: JSON.stringify({ salaryProfileId, ...payload }) });
      load();
      onChanged();
    } catch (err) {
      setPayError(err instanceof ApiClientError ? err.message : "Could not record this payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={salaryProfileId !== null} onClose={onClose} title={ledger?.name ? `Payroll — ${ledger.name}` : "Payroll"} width="xl">
      {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      {!ledger && !error && (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonBlock key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {ledger && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {ledger.salaryType && <Badge tone="primary">{SALARY_TYPE_LABELS[ledger.salaryType]}</Badge>}
            {ledger.title && <Badge tone="neutral">{ledger.title}</Badge>}
          </div>

          <PayrollLedgerView ledger={ledger} submitting={submitting} error={payError} onPay={handlePay} />

          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">Payment history</p>

            {/* Desktop / tablet: table */}
            <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Amount</th>
                      <th className="px-4 py-2.5 font-medium">Mode</th>
                      <th className="px-4 py-2.5 font-medium">Recorded by</th>
                      <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className={`border-b border-border last:border-0 ${p.voided ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">{fmtDate(p.paidOn)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">
                          {formatMoney(p.amount)} {p.voided && <Badge tone="danger">Voided</Badge>}
                        </td>
                        <td className="px-4 py-3 text-foreground">{PAYMENT_MODE_LABELS[p.mode]}</td>
                        <td className="px-4 py-3 text-foreground">{p.createdByName ?? "—"}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {!p.voided && (
                              <button type="button" onClick={() => setPayslipTarget(p)} className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80">
                                Payslip
                              </button>
                            )}
                            {!p.voided && canVoid && (
                              <button type="button" onClick={() => setVoidTarget(p)} className="text-xs font-medium text-danger underline underline-offset-2 hover:text-danger/80">
                                Void
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {payments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
              {payments.map((p) => (
                <div key={p.id} className={`rounded-xl border border-border p-3 ${p.voided ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{formatMoney(p.amount)}</span>
                    {p.voided && <Badge tone="danger">Voided</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(p.paidOn)} · {PAYMENT_MODE_LABELS[p.mode]}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{p.createdByName ?? "—"}</p>
                    <div className="flex items-center gap-3">
                      {!p.voided && (
                        <button type="button" onClick={() => setPayslipTarget(p)} className="text-xs font-medium text-accent underline underline-offset-2">
                          Payslip
                        </button>
                      )}
                      {!p.voided && canVoid && (
                        <button type="button" onClick={() => setVoidTarget(p)} className="text-xs font-medium text-danger underline underline-offset-2">
                          Void
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {payments.length === 0 && (
                <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      <VoidPayrollPaymentModal
        payment={voidTarget}
        onClose={() => setVoidTarget(null)}
        onVoided={() => {
          load();
          onChanged();
        }}
      />

      <PayslipModal
        payment={payslipTarget}
        staffName={ledger?.name ?? null}
        pendingAmount={ledger?.totals.totalPending ?? null}
        onClose={() => setPayslipTarget(null)}
      />
    </Modal>
  );
}
