"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import type { PayrollRun, PayrollRunPreview } from "@/lib/types";
import { formatDate } from "@/lib/format";

/** "YYYY-MM" for the current payroll period, computed in IST regardless of
 * the browser's own timezone — otherwise a browser near a month boundary in
 * a timezone behind IST could show last month's period as "current". */
function currentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date());
  return parts;
}

const STATUS_TONE = { DRAFT: "neutral", APPROVED: "warning", PAID: "success" } as const;

export function RunsTab() {
  const { user } = useAuth();
  // Creating/approving/reopening a run is a compensation sign-off — OWNER/ADMIN
  // only. Marking a run paid is routine "the money went out" data entry, same
  // as recording an individual payment, so ACCOUNTANT gets that too.
  const canManage = user?.role === "OWNER" || user?.role === "ADMIN";
  const canPay = canManage || user?.role === "ACCOUNTANT";

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [preview, setPreview] = useState<PayrollRunPreview | null>(null);
  const [activeRun, setActiveRun] = useState<PayrollRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);

  function loadRuns() {
    apiFetch<PayrollRun[]>("/payroll/runs")
      .then(setRuns)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load payroll runs."));
  }

  useEffect(loadRuns, []);

  function loadForPeriod(p: string) {
    setError(null);
    const existing = runs.find((r) => r.periodMonth === p);
    if (existing) {
      setActiveRun(null);
      setPreview(null);
      apiFetch<PayrollRun>(`/payroll/runs/${existing.id}`)
        .then(setActiveRun)
        .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this run."));
    } else {
      setActiveRun(null);
      setPreview(null);
      apiFetch<PayrollRunPreview>(`/payroll/runs/preview?period=${p}`)
        .then(setPreview)
        .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load a preview for this period."));
    }
  }

  useEffect(() => {
    if (runs.length >= 0) loadForPeriod(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, runs]);

  async function handleCreateDraft() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/payroll/runs", { method: "POST", body: JSON.stringify({ period }) });
      loadRuns();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create a draft run.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: "approve" | "reopen") {
    if (!activeRun) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/payroll/runs/${activeRun.id}/${action}`, { method: "POST" });
      loadRuns();
      loadForPeriod(period);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this run.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkPaid() {
    if (!activeRun) return;
    await apiFetch(`/payroll/runs/${activeRun.id}/pay`, { method: "POST" });
    loadRuns();
    loadForPeriod(period);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Period</span>
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {preview && !activeRun && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{preview.label} — preview</p>
              <p className="text-xs text-muted-foreground">Dry run — nothing is saved until a draft is created.</p>
            </div>
            <p className="text-lg font-semibold text-foreground">{formatMoney(preview.totalAmount)}</p>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border">
            {preview.staff.map((s) => (
              <div key={s.salaryProfileId} className="flex justify-between px-3 py-2 text-sm">
                <span className="text-foreground">{s.name}</span>
                <span className="tabular-nums text-foreground">{formatMoney(s.projectedAmount)}</span>
              </div>
            ))}
            {preview.staff.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">No active staff on payroll.</p>}
          </div>

          {canManage && (
            <div className="flex justify-end">
              <Button onClick={handleCreateDraft} disabled={busy}>
                {busy ? "Creating…" : "Create draft run"}
              </Button>
            </div>
          )}
        </div>
      )}

      {activeRun && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-foreground">{activeRun.label}</p>
              <Badge tone={STATUS_TONE[activeRun.status]}>{activeRun.status}</Badge>
            </div>
            <p className="text-lg font-semibold text-foreground">{formatMoney(activeRun.summary?.totalAmount)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-semibold text-foreground">{formatMoney(activeRun.summary?.totalAmount)}</p>
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="font-semibold text-foreground">{formatMoney(activeRun.summary?.totalPaid)}</p>
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="font-semibold text-foreground">{formatMoney(activeRun.summary?.totalOutstanding)}</p>
            </div>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border">
            {activeRun.summary?.staff.map((s) => (
              <div key={s.salaryProfileId} className="flex justify-between px-3 py-2 text-sm">
                <span className="text-foreground">{s.name}</span>
                <span className="tabular-nums text-foreground">
                  {formatMoney(s.totalPaid)} / {formatMoney(s.totalAmount)}
                </span>
              </div>
            ))}
          </div>

          {(canManage || canPay) && (
            <div className="flex justify-end gap-2">
              {activeRun.status === "DRAFT" && canManage && (
                <Button onClick={() => runAction("approve")} disabled={busy}>
                  {busy ? "Working…" : "Approve"}
                </Button>
              )}
              {activeRun.status === "APPROVED" && (
                <>
                  {canManage && (
                    <Button variant="secondary" onClick={() => runAction("reopen")} disabled={busy}>
                      Reopen as draft
                    </Button>
                  )}
                  {canPay && (
                    <Button onClick={() => setPayConfirmOpen(true)} disabled={busy}>
                      Mark paid
                    </Button>
                  )}
                </>
              )}
              {activeRun.status === "PAID" && canManage && (
                <Button variant="secondary" onClick={() => runAction("reopen")} disabled={busy}>
                  Reopen as draft
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-foreground">All runs</p>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Period</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Approved</th>
                  <th className="px-4 py-3 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted" onClick={() => setPeriod(r.periodMonth)}>
                    <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-foreground">{formatDate(r.approvedAt)}</td>
                    <td className="px-4 py-3 text-foreground">{formatDate(r.paidAt)}</td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No payroll runs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={payConfirmOpen}
        onClose={() => setPayConfirmOpen(false)}
        onConfirm={handleMarkPaid}
        title="Mark this run as paid?"
        description="Every active staff member's remaining outstanding balance for this period is paid in full. Anyone already fully paid individually is untouched."
        confirmLabel="Mark paid"
        destructive={false}
      />
    </div>
  );
}
