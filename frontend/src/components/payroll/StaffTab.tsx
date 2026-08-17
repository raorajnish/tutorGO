"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { AddSalaryProfileModal } from "@/components/payroll/AddSalaryProfileModal";
import { EditSalaryProfileModal } from "@/components/payroll/EditSalaryProfileModal";
import { StaffLedgerModal } from "@/components/payroll/StaffLedgerModal";
import { formatMoney, parseMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import { SALARY_TYPE_LABELS, type PayrollStaffResponse, type SalaryProfileListItem, type UnconfiguredStaffUser } from "@/lib/types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function StaffTab() {
  const { user } = useAuth();
  const canManage = user?.role === "OWNER" || user?.role === "ADMIN";

  const [data, setData] = useState<PayrollStaffResponse | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [presetUser, setPresetUser] = useState<UnconfiguredStaffUser | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<SalaryProfileListItem | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  function load() {
    apiFetch<PayrollStaffResponse>("/payroll/staff")
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load the staff directory."));
  }

  useEffect(load, []);

  const allStaff = data?.staff ?? [];
  const staff = search.trim()
    ? allStaff.filter(
        (s) => s.name.toLowerCase().includes(search.toLowerCase()) || (s.title ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : allStaff;
  const totalPending = allStaff.reduce((sum, s) => sum + Math.max(0, parseMoney(s.pendingAmount)), 0);
  const totalCredit = allStaff.reduce((sum, s) => sum + Math.max(0, -parseMoney(s.pendingAmount)), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Staff on payroll" value={allStaff.length} tone="primary" />
        <StatCard label="Total pending" value={formatMoney(totalPending)} tone="warning" />
        <StatCard label="Total credit" value={formatMoney(totalCredit)} tone="success" />
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Staff directory</p>
          {canManage && (
            <Button
              variant="secondary"
              onClick={() => {
                setPresetUser(null);
                setAddOpen(true);
              }}
            >
              Add external staff
            </Button>
          )}
        </div>

        <Input placeholder="Search name or title…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3 max-w-xs" />

        {/* Desktop / tablet: table */}
        <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Salary</th>
                  <th className="px-4 py-3 font-medium">Pending / credit</th>
                  <th className="px-4 py-3 font-medium">Last paid</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => {
                  const pending = parseMoney(s.pendingAmount);
                  const inactiveWithBalance = !s.isActive && pending > 0.005;
                  return (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted">
                      <td className="cursor-pointer px-4 py-3" onClick={() => setSelectedProfileId(s.id)}>
                        <p className="font-medium text-foreground">{s.name}</p>
                        {s.isExternal && <p className="text-xs text-muted-foreground">External staff</p>}
                        {!s.isActive && (
                          <Badge tone={inactiveWithBalance ? "danger" : "neutral"}>
                            {inactiveWithBalance ? `Inactive · ${formatMoney(pending)} still owed` : "Inactive"}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">{s.title ?? "—"}</td>
                      <td className="px-4 py-3 text-foreground">
                        {SALARY_TYPE_LABELS[s.salaryType]} · {formatMoney(s.salaryType === "FIXED" ? s.monthlyRate : s.perLectureRate)}
                      </td>
                      <td className="px-4 py-3">
                        {pending > 0.005 ? (
                          <Badge tone="warning">{formatMoney(pending)} due</Badge>
                        ) : pending < -0.005 ? (
                          <Badge tone="success">{formatMoney(-pending)} credit</Badge>
                        ) : (
                          <Badge tone="success">Settled</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {s.lastPaidOn ? `${formatMoney(s.lastPaidAmount)} · ${fmtDate(s.lastPaidOn)}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setSelectedProfileId(s.id)}
                            className="cursor-pointer text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80"
                          >
                            View ledger
                          </button>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => setEditTarget(s)}
                              className="cursor-pointer text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {staff.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      {allStaff.length === 0 ? "No staff on payroll yet." : "No staff match this search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile: cards */}
        <div className="space-y-2 sm:hidden">
          {staff.map((s) => {
            const pending = parseMoney(s.pendingAmount);
            const inactiveWithBalance = !s.isActive && pending > 0.005;
            return (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => setSelectedProfileId(s.id)} className="min-w-0 text-left">
                    <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.title ?? "—"}
                      {s.isExternal && " · External staff"}
                    </p>
                  </button>
                  {!s.isActive && (
                    <Badge tone={inactiveWithBalance ? "danger" : "neutral"}>{inactiveWithBalance ? "Inactive · owed" : "Inactive"}</Badge>
                  )}
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {SALARY_TYPE_LABELS[s.salaryType]} · {formatMoney(s.salaryType === "FIXED" ? s.monthlyRate : s.perLectureRate)}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {pending > 0.005 ? (
                    <Badge tone="warning">{formatMoney(pending)} due</Badge>
                  ) : pending < -0.005 ? (
                    <Badge tone="success">{formatMoney(-pending)} credit</Badge>
                  ) : (
                    <Badge tone="success">Settled</Badge>
                  )}
                  {s.lastPaidOn && <span className="text-xs text-muted-foreground">Last paid {formatMoney(s.lastPaidAmount)} · {fmtDate(s.lastPaidOn)}</span>}
                </div>

                <div className="mt-2.5 flex items-center gap-4 border-t border-border pt-2.5">
                  <button type="button" onClick={() => setSelectedProfileId(s.id)} className="text-xs font-medium text-accent underline underline-offset-2">
                    View ledger
                  </button>
                  {canManage && (
                    <button type="button" onClick={() => setEditTarget(s)} className="text-xs font-medium text-muted-foreground underline underline-offset-2">
                      Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {staff.length === 0 && (
            <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              {allStaff.length === 0 ? "No staff on payroll yet." : "No staff match this search."}
            </p>
          )}
        </div>
      </div>

      {canManage && (data?.unconfigured.length ?? 0) > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">Not on payroll yet</p>

          {/* Desktop / tablet: table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.unconfigured.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted">
                      <td className="px-4 py-3 font-medium text-foreground">{u.fullName}</td>
                      <td className="px-4 py-3 text-foreground">{u.role}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setPresetUser(u);
                            setAddOpen(true);
                          }}
                          className="cursor-pointer rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
                        >
                          Set up salary
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile: cards */}
          <div className="space-y-2 sm:hidden">
            {data!.unconfigured.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{u.fullName}</p>
                  <p className="text-xs text-muted-foreground">{u.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPresetUser(u);
                    setAddOpen(true);
                  }}
                  className="shrink-0 cursor-pointer rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
                >
                  Set up salary
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <AddSalaryProfileModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} presetUser={presetUser} />
      <EditSalaryProfileModal profile={editTarget} onClose={() => setEditTarget(null)} onSaved={load} onDeleted={load} />
      <StaffLedgerModal salaryProfileId={selectedProfileId} onClose={() => setSelectedProfileId(null)} onChanged={load} />
    </div>
  );
}
