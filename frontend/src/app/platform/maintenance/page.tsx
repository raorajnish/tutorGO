"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import type { MaintenanceWindow, PlatformInstituteListItem } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const STATUS_TONE: Record<MaintenanceWindow["status"], "warning" | "success" | "neutral" | "danger"> = {
  upcoming: "warning",
  active: "success",
  ended: "neutral",
  cancelled: "danger",
};

/** SuperAdmin-only screen for scheduling GLOBAL (platform-wide) maintenance
 * and getting a cross-institute view of every window (changes-phase12.md
 * §12.11). Per-institute windows are also schedulable from that institute's
 * own detail page — this list shows both. */
export default function PlatformMaintenancePage() {
  const [windows, setWindows] = useState<MaintenanceWindow[] | null>(null);
  const [institutes, setInstitutes] = useState<PlatformInstituteListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function load() {
    apiFetch<MaintenanceWindow[]>("/platform/maintenance")
      .then(setWindows)
      .catch(() => setWindows([]));
  }

  useEffect(load, []);

  useEffect(() => {
    apiFetch<PlatformInstituteListItem[]>("/platform/institutes")
      .then(setInstitutes)
      .catch(() => setInstitutes([]));
  }, []);

  async function schedule(scope: "GLOBAL" | "INSTITUTE", instituteId: string | null, startAt: string, endAt: string, message: string) {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/platform/maintenance", {
        method: "POST",
        body: JSON.stringify({ scope, instituteId: instituteId || undefined, startAt, endAt, message: message || undefined }),
      });
      setScheduleOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not schedule maintenance.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    setError(null);
    try {
      await apiFetch(`/platform/maintenance/${id}/cancel`, { method: "PATCH" });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not cancel this window.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Maintenance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scheduled, temporary downtime — platform-wide or for one institute. SuperAdmin access is never
            affected. Cancel a window any time, before or during, to restore access immediately.
          </p>
        </div>
        <Button variant="primary" onClick={() => setScheduleOpen(true)}>
          Schedule maintenance
        </Button>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Scope</th>
              <th className="px-4 py-2.5">Window</th>
              <th className="px-4 py-2.5">Message</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Scheduled by</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {windows === null &&
              Array.from({ length: 4 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={6}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
            {windows?.map((w) => (
              <tr key={w.id}>
                <td className="px-4 py-3 text-foreground">{w.scope === "GLOBAL" ? "Platform-wide" : (w.institute?.name ?? "—")}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDateTime(w.startAt)} – {formatDateTime(w.endAt)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{w.message ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge tone={STATUS_TONE[w.status]}>{w.status}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{w.createdBy.fullName}</td>
                <td className="px-4 py-3 text-right">
                  {(w.status === "upcoming" || w.status === "active") && (
                    <Button variant="destructive" onClick={() => cancel(w.id)}>
                      Cancel
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {windows && windows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No maintenance windows scheduled.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ScheduleGlobalMaintenanceModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onConfirm={schedule}
        institutes={institutes}
        submitting={submitting}
      />
    </div>
  );
}

function ScheduleGlobalMaintenanceModal({
  open,
  onClose,
  onConfirm,
  institutes,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (scope: "GLOBAL" | "INSTITUTE", instituteId: string | null, startAt: string, endAt: string, message: string) => void;
  institutes: PlatformInstituteListItem[];
  submitting: boolean;
}) {
  const [scope, setScope] = useState<"GLOBAL" | "INSTITUTE">("GLOBAL");
  const [instituteId, setInstituteId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [message, setMessage] = useState("");

  function handleClose() {
    setScope("GLOBAL");
    setInstituteId("");
    setStartAt("");
    setEndAt("");
    setMessage("");
    onClose();
  }

  const valid =
    !!startAt &&
    !!endAt &&
    new Date(endAt) > new Date(startAt) &&
    new Date(endAt) > new Date() &&
    (scope === "GLOBAL" || !!instituteId);

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule maintenance"
      description="A platform-wide window blocks every role except SuperAdmin. An institute window blocks only that institute's staff and students."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              onConfirm(
                scope,
                scope === "INSTITUTE" ? instituteId : null,
                new Date(startAt).toISOString(),
                new Date(endAt).toISOString(),
                message
              )
            }
            disabled={submitting || !valid}
          >
            {submitting ? "Scheduling…" : "Schedule"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Dropdown
          label="Scope"
          value={scope}
          onChange={(v) => setScope(v as "GLOBAL" | "INSTITUTE")}
          options={[
            { value: "GLOBAL", label: "Platform-wide" },
            { value: "INSTITUTE", label: "One institute" },
          ]}
        />
        {scope === "INSTITUTE" && (
          <Dropdown
            label="Institute"
            value={instituteId}
            onChange={setInstituteId}
            placeholder="Select an institute"
            options={institutes.map((i) => ({ value: i.id, label: `${i.name} (${i.organization.name})` }))}
          />
        )}
        <Input label="Starts at" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        <Input label="Ends at" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">Message (optional)</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="What's this for? Shown to affected users, e.g. 'Upgrading our payment system'."
            className="w-full resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </Modal>
  );
}
