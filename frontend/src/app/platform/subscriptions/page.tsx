"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { CAPPED_ROLES, CAPPED_ROLE_LABELS, MODULE_LABELS, type Plan, type SubscriptionRow } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [changingPlanFor, setChangingPlanFor] = useState<SubscriptionRow | null>(null);

  function load() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (planFilter) params.set("planCode", planFilter);
    apiFetch<SubscriptionRow[]>(`/platform/subscriptions?${params.toString()}`)
      .then(setRows)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load subscriptions."));
  }

  useEffect(() => {
    apiFetch<Plan[]>("/platform/plans").then(setPlans).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, planFilter]);

  const planOptions = useMemo(
    () => [{ value: "", label: "All plans" }, ...plans.map((p) => ({ value: p.code, label: p.name }))],
    [plans]
  );

  const stats = useMemo(() => {
    if (!rows) return { total: 0, atLimit: 0, noPlan: 0 };
    return {
      total: rows.length,
      atLimit: rows.filter((r) => r.atLimit).length,
      noPlan: rows.filter((r) => !r.plan).length,
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Subscriptions</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every institute&apos;s plan, live usage, and active modules — in one place.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Institutes" value={stats.total} tone="primary" />
        <StatCard label="At their plan limit" value={stats.atLimit} tone="warning" />
        <StatCard label="No plan assigned" value={stats.noPlan} tone="danger" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <Input
            placeholder="Search institute, organization…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
          />
          <div className="sm:w-56">
            <Dropdown value={planFilter} onChange={setPlanFilter} options={planOptions} />
          </div>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Institute</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Usage</th>
                <th className="px-4 py-3 font-medium">Modules</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Since</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows?.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.code} · {row.organization.name}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {row.plan ? (
                      <Badge tone={row.atLimit ? "warning" : "primary"}>{row.plan.name}</Badge>
                    ) : (
                      <Badge tone="danger">No plan</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.limits ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {CAPPED_ROLES.map((role) => {
                          const l = row.limits![role];
                          const atLimit = l.used >= l.max;
                          return (
                            <span key={role} className={atLimit ? "font-medium text-warning" : ""}>
                              {CAPPED_ROLE_LABELS[role]}: {l.used}/{l.max}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unlimited</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.activeModules.length}</td>
                  <td className="px-4 py-3">
                    <Badge tone={row.isActive ? "success" : "danger"}>{row.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" onClick={() => setChangingPlanFor(row)}>
                      Change plan
                    </Button>
                  </td>
                </tr>
              ))}
              {rows && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No institutes match this search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile / tablet cards */}
        <div className="divide-y divide-border lg:hidden">
          {rows?.map((row) => (
            <div key={row.id} className="space-y-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.code} · {row.organization.name}
                  </p>
                </div>
                <Badge tone={row.isActive ? "success" : "danger"}>{row.isActive ? "Active" : "Inactive"}</Badge>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {row.plan ? (
                  <Badge tone={row.atLimit ? "warning" : "primary"}>{row.plan.name}</Badge>
                ) : (
                  <Badge tone="danger">No plan</Badge>
                )}
                <span className="text-xs text-muted-foreground">{row.activeModules.length} modules active</span>
              </div>

              {row.limits && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                  {CAPPED_ROLES.map((role) => {
                    const l = row.limits![role];
                    const atLimit = l.used >= l.max;
                    return (
                      <span key={role} className={atLimit ? "font-medium text-warning" : ""}>
                        {CAPPED_ROLE_LABELS[role]}: {l.used}/{l.max}
                      </span>
                    );
                  })}
                </div>
              )}

              <Button variant="secondary" onClick={() => setChangingPlanFor(row)} className="w-full">
                Change plan
              </Button>
            </div>
          ))}
          {rows && rows.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No institutes match this search.</p>
          )}
        </div>
      </div>

      {changingPlanFor && (
        <ChangePlanModal
          row={changingPlanFor}
          plans={plans}
          onClose={() => setChangingPlanFor(null)}
          onChanged={() => {
            setChangingPlanFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ChangePlanModal({
  row,
  plans,
  onClose,
  onChanged,
}: {
  row: SubscriptionRow;
  plans: Plan[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [planId, setPlanId] = useState(row.plan?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/platform/institutes/${row.id}/plan`, {
        method: "PATCH",
        body: JSON.stringify({ planId: planId || null }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not change this institute's plan.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Change plan — ${row.name}`}
      description={row.organization.name}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Dropdown
          label="Plan"
          value={planId}
          onChange={setPlanId}
          options={[{ value: "", label: "No plan (unlimited)" }, ...plans.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))]}
        />
        {row.limits && (
          <div className="rounded-xl border border-border bg-muted p-3 text-xs text-muted-foreground">
            <p className="mb-1.5 font-medium text-foreground">Current usage</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CAPPED_ROLES.map((role) => (
                <span key={role}>
                  {CAPPED_ROLE_LABELS[role]}: {row.limits![role].used}
                </span>
              ))}
            </div>
            <p className="mt-2">A plan that&apos;s already below current usage will block new invites until headcount drops.</p>
          </div>
        )}
        {row.activeModules.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {row.activeModules.map((m) => (
              <Badge key={m} tone="primary">
                {MODULE_LABELS[m]}
              </Badge>
            ))}
          </div>
        )}
        {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      </div>
    </Modal>
  );
}
