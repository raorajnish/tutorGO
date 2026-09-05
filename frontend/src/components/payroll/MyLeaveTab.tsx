"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { formatDate, todayInput } from "@/lib/format";
import type { CreateLeaveRequestResult, LeaveRequest, LeaveStatus } from "@/lib/types";

const STATUS_TONE: Record<LeaveStatus, "neutral" | "warning" | "success" | "danger"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

/** Request leave and track your own history — every staff role gets this tab
 * on the Payroll page. Approval happens on the sibling "Leave" tab, visible
 * only to OWNER/ADMIN. */
export function MyLeaveTab() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(todayInput());
  const [endDate, setEndDate] = useState(todayInput());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [overlapWarning, setOverlapWarning] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    apiFetch<LeaveRequest[]>("/org/leave/mine")
      .then(setRequests)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load your leave requests."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOverlapWarning(false);
    setSubmitting(true);
    try {
      const result = await apiFetch<CreateLeaveRequestResult>("/org/leave", {
        method: "POST",
        body: JSON.stringify({ startDate, endDate, reason }),
      });
      setReason("");
      setStartDate(todayInput());
      setEndDate(todayInput());
      if (result.overlapsApprovedLeave) setOverlapWarning(true);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not submit this leave request.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm("Withdraw this leave request?")) return;
    try {
      await apiFetch(`/org/leave/${id}/cancel`, { method: "POST" });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not withdraw this request.");
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-(--shadow-card)"
      >
        <p className="text-sm font-medium text-foreground">Request leave</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="From"
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
          <Input label="To" type="date" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <Input label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family function" />

        {overlapWarning && (
          <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            Heads up — this overlaps a leave request you already have approved. Submitted anyway; your reviewer will see both.
          </div>
        )}
        {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <p className="text-sm font-medium text-foreground">Your requests</p>
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Days</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Reviewed by</th>
                <th className="px-4 py-3 font-medium" />
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
              {!loading && requests.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-foreground">
                    {formatDate(r.startDate)}
                    {r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""}
                  </td>
                  <td className="px-4 py-3 text-foreground">{r.days}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.reason}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    {r.reviewNote && <p className="mt-1 text-xs text-muted-foreground">{r.reviewNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.reviewedByName ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "PENDING" && (
                      <Button variant="ghost" onClick={() => handleCancel(r.id)}>
                        Withdraw
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No leave requests yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
          {!loading && requests.map((r) => (
            <div key={r.id} className="space-y-1.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-foreground">
                  {formatDate(r.startDate)}
                  {r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""}
                </p>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {r.days} day{r.days === 1 ? "" : "s"} · {r.reason}
              </p>
              {r.reviewedByName && <p className="text-xs text-muted-foreground">Reviewed by {r.reviewedByName}</p>}
              {r.status === "PENDING" && (
                <Button variant="ghost" onClick={() => handleCancel(r.id)} className="w-full">
                  Withdraw
                </Button>
              )}
            </div>
          ))}
          {!loading && requests.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No leave requests yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
