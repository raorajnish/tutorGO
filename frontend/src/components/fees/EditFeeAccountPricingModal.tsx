"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { SkeletonLine, SkeletonBlock } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatMoney } from "@/lib/money";
import type { DiscountType, FeeAccountResponse, FeeStructure, RevisePricingPayload, StudentSubject } from "@/lib/types";
import { DiscountTypeToggle } from "./DiscountTypeToggle";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  studentId: string;
  studentName: string;
  courseId: string;
}

/**
 * Correcting a fee account that was set up wrong — the wrong subjects ticked
 * on a subject-wise course, or a mistyped course fee/discount on a flat one.
 * Only reachable pre-payment (the parent gates the trigger on totalPaid === 0,
 * and the backend enforces the same rule regardless). Distinct from dropping
 * a subject mid-course (StudentProfileModal's Subjects section), which never
 * touches the fee — this rebuilds the schedule because the original numbers
 * were wrong from the start, not because something changed later.
 */
export function EditFeeAccountPricingModal({ open, onClose, onSaved, studentId, studentName, courseId }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [structure, setStructure] = useState<FeeStructure | null>(null);
  const [installmentCount, setInstallmentCount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [discountType, setDiscountType] = useState<DiscountType>("FLAT");
  const [courseFee, setCourseFee] = useState("");
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    setError(null);

    Promise.all([
      apiFetch<FeeAccountResponse>(`/fees/accounts/${studentId}`),
      apiFetch<FeeStructure[]>(`/academics/fee-structures?courseId=${courseId}`),
      apiFetch<StudentSubject[]>(`/students/${studentId}/subjects`),
    ])
      .then(([{ account }, structures, subjects]) => {
        if (!account) throw new Error("This student has no fee account to correct.");
        if (account.planType !== "ONE_TIME") throw new Error("Only one-time fee accounts can be corrected here.");

        const matched = account.feeStructure ? structures.find((s) => s.id === account.feeStructure!.id) ?? null : null;
        setStructure(matched);
        setInstallmentCount(String(account.installmentCount ?? 1));
        setDiscount(account.discount ?? "0");
        setDiscountType(account.discountType ?? "FLAT");
        setCourseFee(account.courseFee ?? "");
        setSelectedSubjectIds(subjects.filter((s) => s.isActive).map((s) => s.subjectId));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load this fee account."))
      .finally(() => setLoading(false));
  }, [open, studentId, courseId]);

  const isSubjectWise = structure?.subjectLines != null;
  const subjectLines = useMemo(() => structure?.subjectLines ?? [], [structure]);

  const selectedLines = useMemo(
    () => subjectLines.filter((l) => selectedSubjectIds.includes(l.subjectId)),
    [subjectLines, selectedSubjectIds]
  );
  const subjectTotal = selectedLines.reduce((sum, l) => sum + Number(l.amount), 0);
  const hasPaidSubject = selectedLines.some((l) => Number(l.amount) > 0);

  const baseFee = isSubjectWise ? subjectTotal : Number(courseFee || 0);
  const discountValue = Number(discount) || 0;
  // Mirrors lib/feeMath.ts's computeFinalFee exactly.
  const discountOff = discountType === "PERCENT" ? (baseFee * discountValue) / 100 : discountValue;
  const finalFee = Math.max(0, baseFee - discountOff);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSubjectWise && !hasPaidSubject) {
      setError("Select at least one paid subject — complementary subjects are included with a paid enrollment, not offered on their own.");
      return;
    }

    setSubmitting(true);
    try {
      const body: RevisePricingPayload = {
        discount: Number(discount) || 0,
        discountType,
        installmentCount: Number(installmentCount) || undefined,
        ...(isSubjectWise ? { subjectIds: selectedSubjectIds } : { courseFee: Number(courseFee) || 0 }),
      };
      await apiFetch(`/fees/accounts/${studentId}/pricing`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this fee account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Correct fee account — ${studentName}`}
      description="Only possible before any payment is recorded — this rebuilds the installment schedule from scratch."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-fee-pricing-form"
            disabled={loading || !!loadError || submitting || (isSubjectWise && !hasPaidSubject)}
          >
            {submitting ? "Saving…" : "Save correction"}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <SkeletonLine className="w-1/3" />
          <SkeletonBlock className="h-32 w-full" />
          <SkeletonLine className="w-1/2" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{loadError}</div>
      ) : (
        <form id="edit-fee-pricing-form" onSubmit={handleSubmit} className="space-y-4">
          {isSubjectWise ? (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-foreground">Subjects</p>
                <p className="text-xs text-muted-foreground">Uncheck what {studentName} isn&apos;t actually taking.</p>
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                {subjectLines.map((line, i) => {
                  const checked = selectedSubjectIds.includes(line.subjectId);
                  const free = Number(line.amount) === 0;
                  return (
                    <label
                      key={line.subjectId}
                      className={`flex cursor-pointer items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-secondary/50 ${
                        i > 0 ? "border-t border-border" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedSubjectIds((prev) =>
                            e.target.checked ? [...prev, line.subjectId] : prev.filter((id) => id !== line.subjectId)
                          )
                        }
                        className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
                      />
                      <span className={`flex-1 text-sm ${checked ? "text-foreground" : "text-muted-foreground line-through"}`}>
                        {line.subjectName}
                      </span>
                      <span className={`text-sm font-medium ${free ? "text-success" : "text-foreground"}`}>
                        {free ? "Included" : formatMoney(Number(line.amount))}
                      </span>
                    </label>
                  );
                })}
              </div>

              {!hasPaidSubject && (
                <p className="text-xs font-medium text-danger">
                  Select at least one paid subject — complementary subjects are included with a paid enrollment, not offered on
                  their own.
                </p>
              )}
            </div>
          ) : (
            <Input
              label="Course fee (₹)"
              type="number"
              min={0}
              step="0.01"
              required
              value={courseFee}
              onChange={(e) => setCourseFee(e.target.value)}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-foreground">Discount (optional)</span>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    min={0}
                    max={discountType === "PERCENT" ? 100 : undefined}
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
                <DiscountTypeToggle value={discountType} onChange={setDiscountType} />
              </div>
            </div>
            <Input
              label="Installments"
              type="number"
              min={1}
              required
              value={installmentCount}
              onChange={(e) => setInstallmentCount(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted px-3.5 py-2.5">
            <span className="text-sm font-medium text-foreground">Final fee</span>
            <span className="font-display text-base font-semibold text-foreground">{formatMoney(finalFee)}</span>
          </div>

          <p className="text-xs text-muted-foreground">
            Saving regenerates the installment schedule from this total — any manual reschedule or per-installment edit on the
            current schedule will be lost. Safe because no payment has been made yet.
          </p>

          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
