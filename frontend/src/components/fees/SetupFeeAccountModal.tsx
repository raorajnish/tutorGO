"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { formatMoney } from "@/lib/money";
import { FEE_PLAN_TYPE_LABELS, type FeePlanType, type FeeStructure, type FeeStudentRef, type InstallmentInput } from "@/lib/types";

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMonthsCapped(dateInput: string, months: number): string {
  const d = new Date(`${dateInput}T00:00:00Z`);
  const day = Math.min(d.getUTCDate(), 28);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, day));
  return next.toISOString().slice(0, 10);
}

/** Mirrors the backend's split exactly (base = floor to cents, last
 * installment absorbs the rounding remainder) so the preview the staff edits
 * matches what the server would generate if left alone. */
function splitEvenly(total: number, count: number, firstDueDate: string): InstallmentInput[] {
  if (!(total > 0) || !(count > 0) || !firstDueDate) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => ({
    dueDate: addMonthsCapped(firstDueDate, i),
    amount: (i === count - 1 ? base + remainder : base) / 100,
  }));
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  student: FeeStudentRef;
}

const CUSTOM_OPTION = "__custom__";

export function SetupFeeAccountModal({ open, onClose, onSaved, student }: Props) {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [structureId, setStructureId] = useState("");
  const [planType, setPlanType] = useState<FeePlanType>("ONE_TIME");
  const [courseFee, setCourseFee] = useState("");
  const [discount, setDiscount] = useState("0");
  const [installmentCount, setInstallmentCount] = useState("3");
  const [firstDueDate, setFirstDueDate] = useState(todayInput());
  const [rows, setRows] = useState<InstallmentInput[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [billingDay, setBillingDay] = useState("5");
  const [startDate, setStartDate] = useState(todayInput());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStructureId("");
    setPlanType("ONE_TIME");
    setCourseFee("");
    setDiscount("0");
    setInstallmentCount("3");
    setFirstDueDate(todayInput());
    setRows([]);
    setSelectedSubjectIds([]);
    setMonthlyAmount("");
    setBillingDay("5");
    setStartDate(todayInput());
    setError(null);

    apiFetch<FeeStructure[]>(`/academics/fee-structures?courseId=${student.course?.id ?? ""}`)
      .then((all) => {
        const active = all.filter((s) => s.isActive);
        setStructures(active);
        // Only one plan defined for this course — no real choice to make,
        // so skip straight to it instead of making staff pick from a
        // dropdown with a single option. With more than one, pre-select
        // whichever the course has marked default rather than leaving the
        // dropdown empty.
        if (active.length === 1) setStructureId(active[0]!.id);
        else {
          const def = active.find((s) => s.isDefault);
          if (def) setStructureId(def.id);
        }
      })
      .catch(() => setStructures([]));
  }, [open, student.course?.id]);

  const selectedStructure = structures.find((s) => s.id === structureId) ?? null;
  const effectivePlanType = selectedStructure ? selectedStructure.planType : planType;

  // A subject-wise course prices per subject, so the "custom, type your own
  // amount" path doesn't apply — the total has to come from the checklist or
  // the per-subject rows on the receipt wouldn't add up to it.
  const courseIsSubjectWise = structures.some((s) => s.course.feeMode === "SUBJECT_WISE");
  const subjectLines = selectedStructure?.subjectLines ?? null;
  const isSubjectWise = subjectLines !== null;

  // Every subject starts checked — paid and complementary alike. Staff uncheck
  // what a student isn't taking rather than building the list up from nothing.
  useEffect(() => {
    setSelectedSubjectIds(selectedStructure?.subjectLines?.map((l) => l.subjectId) ?? []);
  }, [selectedStructure]);

  const selectedLines = useMemo(
    () => (subjectLines ?? []).filter((l) => selectedSubjectIds.includes(l.subjectId)),
    [subjectLines, selectedSubjectIds]
  );
  const subjectTotal = selectedLines.reduce((sum, l) => sum + Number(l.amount), 0);
  // Complementary subjects come *with* a paid enrollment; a ₹0-only selection
  // is a free ride and is rejected server-side too. A genuine full waiver is a
  // discount, which keeps the original price on the record.
  const hasPaidSubject = selectedLines.some((l) => Number(l.amount) > 0);

  const finalFee = useMemo(() => {
    const base = isSubjectWise
      ? subjectTotal
      : selectedStructure
        ? Number(selectedStructure.courseFee ?? 0)
        : Number(courseFee || 0);
    return Math.max(0, base - (Number(discount) || 0));
  }, [isSubjectWise, subjectTotal, selectedStructure, courseFee, discount]);

  // A structure only pre-fills the count as a default — always editable per
  // student, since one student on the standard plan might genuinely need
  // more (or fewer) installments than the rest of their course.
  useEffect(() => {
    if (selectedStructure?.installmentCount) setInstallmentCount(String(selectedStructure.installmentCount));
  }, [selectedStructure]);

  const effectiveCount = Number(installmentCount || 0);

  // Regenerate the even split whenever the inputs that define the plan shape
  // change — direct row edits (amount/date) don't trigger this, so a manual
  // edit persists until something actually invalidates the shape.
  useEffect(() => {
    if (effectivePlanType !== "ONE_TIME") return;
    if (!(finalFee > 0) || !(effectiveCount > 0) || !firstDueDate) {
      setRows([]);
      return;
    }
    setRows(splitEvenly(finalFee, effectiveCount, firstDueDate));
  }, [effectivePlanType, finalFee, effectiveCount, firstDueDate]);

  const allocated = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const allocatedMismatch = Math.abs(allocated - finalFee) > 0.01;

  /** Editing an amount flows the difference into the *next* row, keeping the
   * plan's total locked at finalFee without manual re-balancing — safe to do
   * here because nothing is paid yet (unlike editing a live plan later,
   * where amounts are deliberately left un-cascaded once money has moved). */
  function updateRow(index: number, patch: Partial<InstallmentInput>) {
    setRows((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, ...patch } : r));
      if (patch.amount !== undefined && index + 1 < next.length) {
        const delta = Number(prev[index]!.amount || 0) - Number(patch.amount || 0);
        const following = next[index + 1]!;
        next[index + 1] = { ...following, amount: Math.max(0, Number(following.amount || 0) + delta) };
      }
      return next;
    });
  }

  function resetSplit() {
    setRows(splitEvenly(finalFee, effectiveCount, firstDueDate));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSubjectWise && !hasPaidSubject) {
      setError("Select at least one paid subject — complementary subjects are included with a paid enrollment, not offered on their own.");
      return;
    }

    if (effectivePlanType === "ONE_TIME" && allocatedMismatch) {
      setError(`Installments add up to ${formatMoney(allocated)}, which doesn't match the final fee of ${formatMoney(finalFee)}`);
      return;
    }

    setSubmitting(true);

    const isCustom = structureId === CUSTOM_OPTION || structureId === "";

    try {
      await apiFetch("/fees/accounts", {
        method: "POST",
        body: JSON.stringify({
          studentId: student.id,
          feeStructureId: isCustom ? undefined : structureId,
          planType: isCustom ? planType : undefined,
          ...(effectivePlanType === "ONE_TIME"
            ? {
                // Never sent on a subject-wise account — the server sums the
                // selected subjects itself and rejects a client-supplied total.
                courseFee: isCustom ? Number(courseFee) : undefined,
                subjectIds: isSubjectWise ? selectedSubjectIds : undefined,
                discount: Number(discount) || undefined,
                installments: rows.map((r) => ({ dueDate: r.dueDate, amount: Number(r.amount) })),
              }
            : {
                monthlyAmount: isCustom ? Number(monthlyAmount) : undefined,
                billingDay: isCustom ? Number(billingDay) : undefined,
                startDate,
              }),
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not set up a fee account for this student.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Set up fee account — ${student.name}`}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="setup-fee-account-form"
            disabled={
              submitting || (isSubjectWise && !hasPaidSubject) || (effectivePlanType === "ONE_TIME" && allocatedMismatch)
            }
          >
            {submitting ? "Setting up…" : "Set up account"}
          </Button>
        </>
      }
    >
      <form id="setup-fee-account-form" onSubmit={handleSubmit} className="space-y-4">
        <Dropdown
          label="Fee structure"
          value={structureId}
          onChange={setStructureId}
          options={[
            ...structures.map((s) => ({ value: s.id, label: `${s.name} (${FEE_PLAN_TYPE_LABELS[s.planType]})` })),
            ...(courseIsSubjectWise ? [] : [{ value: CUSTOM_OPTION, label: "Custom — enter amounts manually" }]),
          ]}
          placeholder="Select a fee structure"
        />

        {isSubjectWise && (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-foreground">Subjects</p>
              <p className="text-xs text-muted-foreground">Everything is included by default — uncheck what {student.name} isn&apos;t taking.</p>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              {subjectLines!.map((line, i) => {
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

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted px-3.5 py-2.5">
              <span className="text-sm font-medium text-foreground">Course fee</span>
              <span className="font-display text-base font-semibold text-foreground">{formatMoney(subjectTotal)}</span>
            </div>

            {!hasPaidSubject && (
              <p className="text-xs font-medium text-danger">
                Select at least one paid subject — complementary subjects are included with a paid enrollment, not offered on their own.
              </p>
            )}
          </div>
        )}

        {structureId === CUSTOM_OPTION && (
          <div className="flex gap-1.5">
            {(["ONE_TIME", "RECURRING"] as const).map((pt) => (
              <button
                key={pt}
                type="button"
                onClick={() => setPlanType(pt)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  planType === pt ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}
              >
                {FEE_PLAN_TYPE_LABELS[pt]}
              </button>
            ))}
          </div>
        )}

        {effectivePlanType === "ONE_TIME" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {structureId === CUSTOM_OPTION ? (
                <Input label="Course fee (₹)" type="number" min={0} step="0.01" required value={courseFee} onChange={(e) => setCourseFee(e.target.value)} />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-foreground">Course fee</span>
                  <div className="flex h-[42px] items-center rounded-xl border border-border bg-muted px-3.5 text-sm text-muted-foreground">
                    {isSubjectWise
                      ? `${formatMoney(subjectTotal)} (${selectedLines.length} subject${selectedLines.length === 1 ? "" : "s"})`
                      : selectedStructure
                        ? `₹${selectedStructure.courseFee}`
                        : "—"}
                  </div>
                </div>
              )}
              <Input
                label="Installments"
                type="number"
                min={1}
                required
                value={installmentCount}
                onChange={(e) => setInstallmentCount(e.target.value)}
              />
              <Input label="Discount (₹, optional)" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
            {selectedStructure && Number(installmentCount) !== selectedStructure.installmentCount && (
              <p className="text-xs text-muted-foreground">
                Overriding this structure&apos;s default of {selectedStructure.installmentCount} installments for {student.name} only —
                the structure itself is unchanged.
              </p>
            )}

            <Input label="First due date (used to generate the split below)" type="date" required value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Installment plan</p>
                <button type="button" onClick={resetSplit} className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80">
                  Split evenly
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Due date</th>
                      <th className="px-3 py-2 font-medium">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={r.dueDate}
                            onChange={(e) => updateRow(i, { dueDate: e.target.value })}
                            className="w-full rounded-lg border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0.01}
                            step="0.01"
                            value={r.amount}
                            onChange={(e) => updateRow(i, { amount: Number(e.target.value) })}
                            className="w-full rounded-lg border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-xs text-muted-foreground">
                          Fill in the fee and installment count above to generate a plan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className={`text-xs font-medium ${allocatedMismatch ? "text-danger" : "text-success"}`}>
                Allocated {formatMoney(allocated)} of {formatMoney(finalFee)}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {structureId === CUSTOM_OPTION && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Monthly amount (₹)"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={monthlyAmount}
                  onChange={(e) => setMonthlyAmount(e.target.value)}
                />
                <Input label="Billing day (1–28)" type="number" min={1} max={28} required value={billingDay} onChange={(e) => setBillingDay(e.target.value)} />
              </div>
            )}
            <Input label="Start date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
