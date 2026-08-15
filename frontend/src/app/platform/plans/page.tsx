"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Toggle } from "@/components/ui/Toggle";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { Plan } from "@/lib/types";

interface PlanFormState {
  code: string;
  name: string;
  description: string;
  maxAdmins: string;
  maxAccountants: string;
  maxFaculty: string;
  maxReception: string;
  maxStudents: string;
}

const EMPTY_FORM: PlanFormState = {
  code: "",
  name: "",
  description: "",
  maxAdmins: "1",
  maxAccountants: "2",
  maxFaculty: "5",
  maxReception: "2",
  maxStudents: "100",
};

function toForm(plan: Plan): PlanFormState {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description ?? "",
    maxAdmins: String(plan.maxAdmins),
    maxAccountants: String(plan.maxAccountants),
    maxFaculty: String(plan.maxFaculty),
    maxReception: String(plan.maxReception),
    maxStudents: String(plan.maxStudents),
  };
}

export default function PlatformPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Plan[]>("/platform/plans");
      setPlans(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load plans.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditing(plan);
    setForm(toForm(plan));
    setFormError(null);
    setModalOpen(true);
  }

  function update<K extends keyof PlanFormState>(key: K, value: PlanFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const payload = {
      code: form.code,
      name: form.name,
      description: form.description || undefined,
      maxAdmins: Number(form.maxAdmins),
      maxAccountants: Number(form.maxAccountants),
      maxFaculty: Number(form.maxFaculty),
      maxReception: Number(form.maxReception),
      maxStudents: Number(form.maxStudents),
    };

    try {
      if (editing) {
        await apiFetch(`/platform/plans/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/platform/plans", { method: "POST", body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : "Could not save plan.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(plan: Plan) {
    setTogglingId(plan.id);
    try {
      await apiFetch(`/platform/plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !plan.isActive }),
      });
      await load();
    } catch {
      // no-op — table stays as-is, user can retry
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await apiFetch(`/platform/plans/${deleteTarget.id}`, { method: "DELETE" });
    await load();
  }

  const activeCount = plans.filter((p) => p.isActive).length;
  const totalInstitutesOnPlans = plans.reduce((sum, p) => sum + p.instituteCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure subscription tiers and headcount limits.</p>
        </div>
        <Button onClick={openCreate}>New plan</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total plans" value={plans.length} tone="primary" />
        <StatCard label="Active" value={activeCount} tone="success" />
        <StatCard label="Institutes assigned" value={totalInstitutesOnPlans} tone="accent" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-sm font-medium text-foreground">All plans</p>
          <Button variant="ghost" onClick={load}>
            Refresh
          </Button>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Admins</th>
                <th className="px-4 py-3 font-medium">Accountants</th>
                <th className="px-4 py-3 font-medium">Faculty</th>
                <th className="px-4 py-3 font-medium">Reception</th>
                <th className="px-4 py-3 font-medium">Students</th>
                <th className="px-4 py-3 font-medium">Institutes</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {plan.name} <span className="text-muted-foreground">· {plan.code}</span>
                    </p>
                    {plan.description && <p className="text-xs text-muted-foreground">{plan.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-foreground">{plan.maxAdmins}</td>
                  <td className="px-4 py-3 text-foreground">{plan.maxAccountants}</td>
                  <td className="px-4 py-3 text-foreground">{plan.maxFaculty}</td>
                  <td className="px-4 py-3 text-foreground">{plan.maxReception}</td>
                  <td className="px-4 py-3 text-foreground">{plan.maxStudents}</td>
                  <td className="px-4 py-3 text-foreground">{plan.instituteCount}</td>
                  <td className="px-4 py-3">
                    <Badge tone={plan.isActive ? "success" : "danger"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" onClick={() => openEdit(plan)}>
                        Edit
                      </Button>
                      <Toggle
                        checked={plan.isActive}
                        onChange={() => toggleActive(plan)}
                        disabled={togglingId === plan.id}
                        label={`Toggle ${plan.name} active`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && plans.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No plans yet — create the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-border sm:hidden">
          {plans.map((plan) => (
            <div key={plan.id} className="space-y-2 p-4" onClick={() => openEdit(plan)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{plan.code}</p>
                </div>
                <Badge tone={plan.isActive ? "success" : "danger"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {plan.maxAdmins} admins · {plan.maxAccountants} accountants · {plan.maxFaculty} faculty · {plan.maxReception} reception ·{" "}
                {plan.maxStudents} students
              </p>
              <p className="text-xs text-muted-foreground">{plan.instituteCount} institutes on this plan</p>
            </div>
          ))}
          {!loading && plans.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No plans yet — create the first one.</p>
          )}
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : "New plan"}
        description="Set the plan's identity and headcount limits per institute."
        width="md"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {editing ? (
              <Button
                variant="destructive"
                onClick={() => {
                  setDeleteTarget(editing);
                  setModalOpen(false);
                }}
              >
                Delete plan
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="plan-form" disabled={submitting}>
                {submitting ? "Saving…" : editing ? "Save changes" : "Create plan"}
              </Button>
            </div>
          </div>
        }
      >
        <form id="plan-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Plan name" required value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Growth" />
            <Input
              label="Plan code"
              required
              value={form.code}
              onChange={(e) => update("code", e.target.value.toUpperCase())}
              placeholder="GROWTH"
              disabled={!!editing}
            />
          </div>

          <Input
            label="Description"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="For a growing institute with a larger team."
          />

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Input
              label="Max admins"
              required
              type="number"
              min={0}
              value={form.maxAdmins}
              onChange={(e) => update("maxAdmins", e.target.value)}
            />
            <Input
              label="Max accountants"
              required
              type="number"
              min={0}
              value={form.maxAccountants}
              onChange={(e) => update("maxAccountants", e.target.value)}
            />
            <Input
              label="Max faculty"
              required
              type="number"
              min={0}
              value={form.maxFaculty}
              onChange={(e) => update("maxFaculty", e.target.value)}
            />
            <Input
              label="Max reception"
              required
              type="number"
              min={0}
              value={form.maxReception}
              onChange={(e) => update("maxReception", e.target.value)}
            />
            <Input
              label="Max students"
              required
              type="number"
              min={0}
              value={form.maxStudents}
              onChange={(e) => update("maxStudents", e.target.value)}
            />
          </div>

          {formError && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</div>}
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.name ?? "plan"}?`}
        description={
          deleteTarget && deleteTarget.instituteCount > 0
            ? `${deleteTarget.instituteCount} institute(s) are on this plan — reassign them before deleting.`
            : undefined
        }
        confirmLabel="Delete plan"
      />
    </div>
  );
}
