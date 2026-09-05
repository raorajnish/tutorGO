"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/format";
import type { LeaveRequest, LeaveStatus } from "@/lib/types";

const STATUS_TONE: Record<LeaveStatus, "neutral" | "warning" | "success" | "danger"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

/** OWNER/ADMIN approve/reject every staff member's leave requests here — the
 * sibling to "My leave", where everyone (including managers) submits their
 * own. Approving does NOT touch payroll math in this phase — see
 * changes-phase10.md §10.4. */
export function LeaveTab() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch<LeaveRequest[]>(`/org/leave${qs}`)
      .then(setRequests)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load leave requests."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [statusFilter]);

  async function handleReview(id: string, status: "APPROVED" | "REJECTED") {
    if (status === "REJECTED") {
      const note = window.prompt("Optional note for this rejection:");
      if (note === null) return; // Cancelled the prompt.
      await review(id, status, note || undefined);
      return;
    }
    await review(id, status);
  }

  async function review(id: string, status: "APPROVED" | "REJECTED", reviewNote?: string) {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/org/leave/${id}`, { method: "PATCH", body: JSON.stringify({ status, reviewNote }) });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this request.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-sm font-medium text-foreground">Leave requests</p>
          <div className="w-40">
            <Dropdown value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTERS} />
          </div>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Staff</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Days</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Status</th>
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
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.userName}</p>
                    <p className="text-xs capitalize text-muted-foreground">{r.userRole.toLowerCase()}</p>
                  </td>
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
                  <td className="px-4 py-3 text-right">
                    {r.status === "PENDING" && (
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" disabled={busyId === r.id} onClick={() => handleReview(r.id, "REJECTED")}>
                          Reject
                        </Button>
                        <Button disabled={busyId === r.id} onClick={() => handleReview(r.id, "APPROVED")}>
                          Approve
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && requests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No leave requests here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
          {!loading && requests.map((r) => (
            <div key={r.id} className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{r.userName}</p>
                  <p className="text-xs capitalize text-muted-foreground">{r.userRole.toLowerCase()}</p>
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {formatDate(r.startDate)}
                {r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ""} · {r.days} day{r.days === 1 ? "" : "s"}
              </p>
              <p className="text-sm text-muted-foreground">{r.reason}</p>
              {r.status === "PENDING" && (
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" disabled={busyId === r.id} onClick={() => handleReview(r.id, "REJECTED")}>
                    Reject
                  </Button>
                  <Button className="flex-1" disabled={busyId === r.id} onClick={() => handleReview(r.id, "APPROVED")}>
                    Approve
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!loading && requests.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No leave requests here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
