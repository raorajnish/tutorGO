"use client";

import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { formatMoney } from "@/lib/money";
import { RescheduleControl } from "./RescheduleControl";
import { EditAmountControl } from "./EditAmountControl";
import { AddInstallmentRow } from "./AddInstallmentRow";
import type { FeeInstallment, InstallmentStatus } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

const STATUS_TONE: Record<InstallmentStatus, "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  PARTIAL: "warning",
  PENDING: "neutral",
  OVERDUE: "danger",
};

interface Props {
  studentId: string;
  installments: FeeInstallment[];
  canWaive: boolean;
  canEditPlan: boolean;
  onChanged: () => void;
}

export function InstallmentList({ studentId, installments, canWaive, canEditPlan, onChanged }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  async function handleWaive(id: string) {
    setError(null);
    try {
      await apiFetch(`/fees/accounts/${studentId}/installments/${id}/waive`, { method: "POST" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not waive this installment.");
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await apiFetch(`/fees/accounts/${studentId}/installments/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not remove this installment.");
    }
  }

  const lastId = installments.length > 0 ? installments[installments.length - 1]!.id : null;

  function menuItems(inst: FeeInstallment) {
    const editable = inst.status !== "PAID" && !inst.waived;
    const removable = canEditPlan && inst.id === lastId && Number(inst.paidAmount) === 0 && !inst.waived;
    const items = [];
    if (editable && canWaive) items.push({ label: "Waive", onClick: () => handleWaive(inst.id) });
    if (removable) items.push({ label: "Remove", tone: "danger" as const, onClick: () => handleDelete(inst.id) });
    return items;
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>
      )}

      {/* Desktop / tablet: table */}
      <div className="hidden overflow-hidden rounded-xl border border-border sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Due date</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Paid</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((inst) => {
                const editable = inst.status !== "PAID" && !inst.waived;
                const menu = menuItems(inst);
                return (
                  <tr key={inst.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{inst.seq}</td>
                    <td className="px-4 py-3 text-foreground">
                      {fmtDate(inst.dueDate)}
                      {inst.originalDueDate && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">was {fmtDate(inst.originalDueDate)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-foreground">{formatMoney(inst.amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-foreground">{formatMoney(inst.paidAmount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={STATUS_TONE[inst.status]}>{inst.waived ? "Waived" : inst.status}</Badge>
                        {inst.adjustedFromPrevious && (
                          <span title="Amount changed because a neighboring installment was settled short or over">
                            <Badge tone="neutral">Adjusted</Badge>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {editable && <RescheduleControl studentId={studentId} installment={inst} onRescheduled={onChanged} />}
                        {editable && canEditPlan && <EditAmountControl studentId={studentId} installment={inst} onChanged={onChanged} />}
                        {menu.length > 0 && <ActionMenu items={menu} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {installments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No installments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-2 sm:hidden">
        {installments.map((inst) => {
          const editable = inst.status !== "PAID" && !inst.waived;
          const menu = menuItems(inst);
          return (
            <div key={inst.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    #{inst.seq} · {fmtDate(inst.dueDate)}
                  </p>
                  {inst.originalDueDate && (
                    <p className="text-xs text-muted-foreground line-through">was {fmtDate(inst.originalDueDate)}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <Badge tone={STATUS_TONE[inst.status]}>{inst.waived ? "Waived" : inst.status}</Badge>
                  {inst.adjustedFromPrevious && (
                    <span title="Amount changed because a neighboring installment was settled short or over">
                      <Badge tone="neutral">Adjusted</Badge>
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {formatMoney(inst.paidAmount)} of {formatMoney(inst.amount)}
                </span>
                <div className="flex items-center gap-0.5">
                  {editable && <RescheduleControl studentId={studentId} installment={inst} onRescheduled={onChanged} />}
                  {editable && canEditPlan && <EditAmountControl studentId={studentId} installment={inst} onChanged={onChanged} />}
                  {menu.length > 0 && <ActionMenu items={menu} />}
                </div>
              </div>
            </div>
          );
        })}
        {installments.length === 0 && (
          <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">No installments yet.</p>
        )}
      </div>

      {canEditPlan && !addOpen && (
        <Button variant="ghost" onClick={() => setAddOpen(true)}>
          + Add installment
        </Button>
      )}
      {canEditPlan && addOpen && (
        <AddInstallmentRow
          studentId={studentId}
          nextSeq={(installments[installments.length - 1]?.seq ?? 0) + 1}
          onAdded={() => {
            setAddOpen(false);
            onChanged();
          }}
          onCancel={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}
