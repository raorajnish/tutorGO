"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import type { Course, FeeStructure, FeePlanType } from "@/lib/types";
import { FEE_PLAN_TYPE_LABELS } from "@/lib/types";

export function FeeStructuresTab() {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([
        apiFetch<FeeStructure[]>("/academics/fee-structures"),
        apiFetch<Course[]>("/academics/courses?active=true"),
      ]);
      setStructures(s);
      setCourses(c);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load fee structures.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(s: FeeStructure) {
    setEditing(s);
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Reusable fee plans per course — attach one to a student instead of typing amounts each time.
          </p>
          <Button onClick={openCreate} className="shrink-0 self-start sm:self-auto">
            New fee structure
          </Button>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        {/* Desktop / tablet: table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {structures.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                  <td className="px-4 py-3 text-foreground">
                    {s.course.name} ({s.course.code})
                  </td>
                  <td className="px-4 py-3 text-foreground">{FEE_PLAN_TYPE_LABELS[s.planType]}</td>
                  <td className="px-4 py-3 text-foreground">
                    {s.planType === "ONE_TIME"
                      ? `${formatMoney(s.courseFee)} · ${s.installmentCount} installments`
                      : `${formatMoney(s.monthlyAmount)}/mo · day ${s.billingDay}`}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" onClick={() => openEdit(s)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && structures.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No fee structures yet — create the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards */}
        <div className="divide-y divide-border sm:hidden">
          {structures.map((s) => (
            <div key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.course.name} ({s.course.code})
                  </p>
                </div>
                <Badge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</Badge>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                {FEE_PLAN_TYPE_LABELS[s.planType]} ·{" "}
                {s.planType === "ONE_TIME"
                  ? `${formatMoney(s.courseFee)} · ${s.installmentCount} installments`
                  : `${formatMoney(s.monthlyAmount)}/mo · day ${s.billingDay}`}
              </p>

              <div className="mt-2.5 border-t border-border pt-2.5">
                <button type="button" onClick={() => openEdit(s)} className="text-xs font-medium text-accent underline underline-offset-2">
                  Edit
                </button>
              </div>
            </div>
          ))}
          {!loading && structures.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No fee structures yet — create the first one.</p>
          )}
        </div>
      </div>

      <FeeStructureModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} editing={editing} courses={courses} />
    </div>
  );
}

function FeeStructureModal({
  open,
  onClose,
  onSaved,
  editing,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: FeeStructure | null;
  courses: Course[];
}) {
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [planType, setPlanType] = useState<FeePlanType>("ONE_TIME");
  const [courseFee, setCourseFee] = useState("");
  const [installmentCount, setInstallmentCount] = useState("3");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [billingDay, setBillingDay] = useState("5");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setCourseId(editing?.course.id ?? "");
    setPlanType(editing?.planType ?? "ONE_TIME");
    setCourseFee(editing?.courseFee ?? "");
    setInstallmentCount(editing?.installmentCount ? String(editing.installmentCount) : "3");
    setMonthlyAmount(editing?.monthlyAmount ?? "");
    setBillingDay(editing?.billingDay ? String(editing.billingDay) : "5");
    setIsActive(editing?.isActive ?? true);
    setError(null);
  }, [open, editing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (editing) {
        await apiFetch(`/academics/fee-structures/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            isActive,
            ...(planType === "ONE_TIME"
              ? { courseFee: Number(courseFee), installmentCount: Number(installmentCount) }
              : { monthlyAmount: Number(monthlyAmount), billingDay: Number(billingDay) }),
          }),
        });
      } else {
        await apiFetch("/academics/fee-structures", {
          method: "POST",
          body: JSON.stringify({
            name,
            courseId,
            planType,
            ...(planType === "ONE_TIME"
              ? { courseFee: Number(courseFee), installmentCount: Number(installmentCount) }
              : { monthlyAmount: Number(monthlyAmount), billingDay: Number(billingDay) }),
          }),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save this fee structure.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "New fee structure"}
      description="A reusable plan for a course — attach it to students from the Fees module."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="fee-structure-form" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Create structure"}
          </Button>
        </>
      }
    >
      <form id="fee-structure-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="10th Standard — 3 Installments" />

        {!editing && (
          <Dropdown
            label="Course"
            value={courseId}
            onChange={setCourseId}
            options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
            placeholder="Select a course"
          />
        )}

        {!editing && (
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

        {planType === "ONE_TIME" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Course fee (₹)"
              type="number"
              min={0}
              step="0.01"
              required
              value={courseFee}
              onChange={(e) => setCourseFee(e.target.value)}
            />
            <Input
              label="Installments"
              type="number"
              min={1}
              required
              value={installmentCount}
              onChange={(e) => setInstallmentCount(e.target.value)}
            />
          </div>
        ) : (
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
            <Input
              label="Billing day (1–28)"
              type="number"
              min={1}
              max={28}
              required
              value={billingDay}
              onChange={(e) => setBillingDay(e.target.value)}
            />
          </div>
        )}

        {editing && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-primary" />
            Active
          </label>
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
