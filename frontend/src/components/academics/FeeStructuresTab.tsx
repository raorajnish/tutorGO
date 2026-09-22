"use client";

import { forwardRef, useEffect, useImperativeHandle, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney } from "@/lib/money";
import type { Course, FeeStructure, FeePlanType, Subject } from "@/lib/types";
import { FEE_PLAN_TYPE_LABELS } from "@/lib/types";
import type { AcademicsTabHandle } from "./tabHandle";
import { Pagination, useClientPagination } from "@/components/ui/Pagination";

import { ImportButton } from "@/components/ui/ImportButton";
import { ExportButton } from "@/components/ui/ExportButton";
import { ImportModal } from "@/components/ui/ImportModal";

/** courseFee is null on a SUBJECT_WISE structure — its price lives on
 * subjectLines instead, since the total is per-student (whichever subjects
 * they pick), not one fixed number on the structure. Sum those lines to show
 * the same "full course, everything selected" total the create form shows. */
function structureAmountSummary(s: FeeStructure): string {
  if (s.planType !== "ONE_TIME") return `${formatMoney(s.monthlyAmount)}/mo · day ${s.billingDay}`;
  if (s.subjectLines) {
    const total = s.subjectLines.reduce((sum, l) => sum + Number(l.amount), 0);
    return `${formatMoney(total)} full · ${s.installmentCount} installments`;
  }
  return `${formatMoney(s.courseFee)} · ${s.installmentCount} installments`;
}

export const FeeStructuresTab = forwardRef<AcademicsTabHandle>(function FeeStructuresTab(_props, ref) {
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");

  const visibleStructures = structures.filter((s) => {
    if (courseFilter && s.course?.id !== courseFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const nameMatch = s.name.toLowerCase().includes(q);
    const courseMatch = `${s.course?.name ?? ""} ${s.course?.code ?? ""}`.toLowerCase().includes(q);
    const planTypeMatch = (FEE_PLAN_TYPE_LABELS[s.planType] ?? "").toLowerCase().includes(q);
    return nameMatch || courseMatch || planTypeMatch;
  });

  const { paginatedItems, paginationProps } = useClientPagination(visibleStructures, 10);

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

  useImperativeHandle(ref, () => ({ openCreate }));

  function openEdit(s: FeeStructure) {
    setEditing(s);
    setModalOpen(true);
  }

  async function handleSetDefault(s: FeeStructure) {
    try {
      await apiFetch(`/academics/fee-structures/${s.id}`, { method: "PATCH", body: JSON.stringify({ isDefault: true }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not set this as the default structure.");
    }
  }

  return (
    <>
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <Input
              placeholder="Search fee structures…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:w-60">
              <Dropdown
                value={courseFilter}
                onChange={setCourseFilter}
                options={[
                  { value: "", label: "All courses" },
                  ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
                ]}
                placeholder="Filter by course"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <ExportButton path="/academics/fee-structures/export.csv" filename="fee-structures.csv" title="Export fee structures as CSV" />
              <ImportButton title="Bulk import fee structures from CSV/Excel" onClick={() => setImportOpen(true)} />
            </div>
          </div>
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
              {loading && Array.from({ length: 5 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={6}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
              {!loading && paginatedItems.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                  <td className="px-4 py-3 text-foreground">
                    {s.course.name} ({s.course.code})
                  </td>
                  <td className="px-4 py-3 text-foreground">{FEE_PLAN_TYPE_LABELS[s.planType]}</td>
                  <td className="px-4 py-3 text-foreground">{structureAmountSummary(s)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                      {s.isDefault && <Badge tone="accent">Default</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      {!s.isDefault && (
                        <Button variant="ghost" onClick={() => handleSetDefault(s)}>
                          Set default
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && visibleStructures.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      message={structures.length === 0 ? "No fee structures yet." : `No fee structures match "${search}"`}
                      actionLabel={structures.length === 0 ? "New fee structure" : undefined}
                      onAction={structures.length === 0 ? openCreate : undefined}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards */}
        <div className="divide-y divide-border sm:hidden">
          {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
          {!loading && paginatedItems.map((s) => (
            <div key={s.id} className="p-4 space-y-2.5 hover:bg-muted/30 transition-colors">
              {/* Top Row: Title on Left, Badges on Right */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold text-sm text-foreground tracking-tight min-w-0 truncate">
                  {s.name}
                </h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge tone={s.isActive ? "success" : "danger"}>
                    {s.isActive ? "Active" : "Inactive"}
                  </Badge>
                  {s.isDefault && <Badge tone="accent">Default</Badge>}
                </div>
              </div>

              {/* Subtitle: Course Name & Code */}
              <p className="text-xs font-medium text-muted-foreground">
                {s.course.name} <span className="opacity-75">({s.course.code})</span>
              </p>

              {/* Bottom Row: Plan Details on Left + Actions on Right */}
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-foreground/80 min-w-0 truncate">
                  {FEE_PLAN_TYPE_LABELS[s.planType]} · <span className="font-semibold text-foreground">{structureAmountSummary(s)}</span>
                </p>

                <div className="flex items-center gap-3 shrink-0">
                  {!s.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(s)}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="text-xs font-bold text-accent hover:underline underline-offset-2 cursor-pointer"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!loading && visibleStructures.length === 0 && (
            <EmptyState
              message={structures.length === 0 ? "No fee structures yet." : `No fee structures match "${search}"`}
              actionLabel={structures.length === 0 ? "New fee structure" : undefined}
              onAction={structures.length === 0 ? openCreate : undefined}
            />
          )}
        </div>

        {!loading && visibleStructures.length > 0 && (
          <Pagination
            {...paginationProps}
            pageSizeOptions={[10, 20, 50]}
            className="border-t border-border bg-card/50"
          />
        )}
      </div>

      <FeeStructureModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} editing={editing} courses={courses} />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import fee structures"
        description="Upload a CSV/Excel file to create multiple fee plans at once."
        templatePath="/academics/fee-structures/import/template.csv"
        templateFilename="fee-structure-import-template.csv"
        importPath="/academics/fee-structures/import"
        onImported={load}
      />
    </div>
    </>
  );
});

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
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectPrices, setSubjectPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCourse = courses.find((c) => c.id === (editing?.course.id ?? courseId)) ?? null;
  const isSubjectWise = selectedCourse?.feeMode === "SUBJECT_WISE";
  // Only the subjects actually linked to this course may be priced — that's
  // the exact set the server requires full coverage of (guard C).
  const courseSubjects = subjects.filter((s) => s.courses.some((c) => c.id === selectedCourse?.id));
  const subjectTotal = courseSubjects.reduce((sum, s) => sum + (Number(subjectPrices[s.id]) || 0), 0);

  // Picking a subject-wise course while "Monthly recurring" is still selected
  // (from a previous course choice) would otherwise leave the form silently
  // showing monthly fields for a course that can't use them.
  useEffect(() => {
    if (isSubjectWise && planType !== "ONE_TIME") setPlanType("ONE_TIME");
  }, [isSubjectWise, planType]);

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

    // Prices come from the structure being edited; anything not yet priced
    // starts at 0 so a newly-added course subject is complementary until set.
    const existing: Record<string, string> = {};
    for (const line of editing?.subjectLines ?? []) existing[line.subjectId] = line.amount;
    setSubjectPrices(existing);

    apiFetch<Subject[]>("/academics/subjects")
      .then(setSubjects)
      .catch(() => setSubjects([]));
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
              ? isSubjectWise
                ? {
                    installmentCount: Number(installmentCount),
                    // Always the course's full subject list — the server rejects
                    // a partial one, since a missing line silently empties that
                    // subject's rosters forever.
                    subjectLines: courseSubjects.map((s) => ({
                      subjectId: s.id,
                      amount: Number(subjectPrices[s.id]) || 0,
                    })),
                  }
                : { courseFee: Number(courseFee), installmentCount: Number(installmentCount) }
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
              ? isSubjectWise
                ? {
                    installmentCount: Number(installmentCount),
                    // Always the course's full subject list — the server rejects
                    // a partial one, since a missing line silently empties that
                    // subject's rosters forever.
                    subjectLines: courseSubjects.map((s) => ({
                      subjectId: s.id,
                      amount: Number(subjectPrices[s.id]) || 0,
                    })),
                  }
                : { courseFee: Number(courseFee), installmentCount: Number(installmentCount) }
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

        {/* A subject-wise total is a sum of per-subject prices, which only
            makes sense as a one-time term fee — there's no such thing as a
            per-subject monthly rate. So a subject-wise course never even
            offers Monthly recurring, rather than letting staff pick it and
            land on a form that quietly doesn't match what they chose. */}
        {!editing && !isSubjectWise && (
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

        {!editing && isSubjectWise && (
          <p className="text-xs text-muted-foreground">
            {courses.find((c) => c.id === courseId)?.name} prices per subject, so this structure is always a one-time
            plan — there&apos;s no such thing as a per-subject monthly rate.
          </p>
        )}

        {planType === "ONE_TIME" && isSubjectWise ? (
          <div className="space-y-4">
            <Input
              label="Installments"
              type="number"
              min={1}
              required
              value={installmentCount}
              onChange={(e) => setInstallmentCount(e.target.value)}
            />

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-foreground">Subject pricing</span>
                <span className="text-xs text-muted-foreground">Use 0 for complementary subjects</span>
              </div>

              {courseSubjects.length === 0 ? (
                <p className="rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
                  This course has no subjects yet. Add them on the Subjects tab before pricing them here.
                </p>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl border border-border">
                    {courseSubjects.map((s, i) => (
                      <div
                        key={s.id}
                        className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
                      >
                        <span className="flex-1 text-sm text-foreground">
                          {s.name} <span className="text-muted-foreground">· {s.shortCode}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-muted-foreground">₹</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={subjectPrices[s.id] ?? "0"}
                            onChange={(e) => setSubjectPrices((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            className="w-28 rounded-lg border border-border bg-card px-2 py-1 text-right text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-border bg-muted px-3.5 py-2.5">
                    <span className="text-sm font-medium text-foreground">Full course total</span>
                    <span className="font-display text-base font-semibold text-foreground">{formatMoney(subjectTotal)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    What a student actually pays is the sum of the subjects they take, chosen when their fee account is
                    set up. Editing these prices never re-prices students already enrolled.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : planType === "ONE_TIME" ? (
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
