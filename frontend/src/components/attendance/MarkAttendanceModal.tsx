"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AttendanceToggleGroup } from "@/components/attendance/ToggleGroup";
import { CopyMessageBox } from "@/components/attendance/CopyMessageBox";
import { useMessageTemplate } from "@/lib/useMessageTemplate";
import { attendanceMarkedVars, renderTemplate } from "@/lib/messageTemplates";
import type { AttendanceStatus, Lecture, RosterEntry } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

interface Props {
  lecture: Lecture | null;
  onClose: () => void;
  onMarked: () => void;
}

export function MarkAttendanceModal({ lecture, onClose, onMarked }: Props) {
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [search, setSearch] = useState("");
  const [fullyMarkedRoster, setFullyMarkedRoster] = useState<RosterEntry[] | null>(null);

  const template = useMessageTemplate(fullyMarkedRoster ? "ATTENDANCE_MARKED" : null);

  function load(): Promise<RosterEntry[]> {
    if (!lecture) return Promise.resolve([]);
    setLoading(true);
    setError(null);
    return apiFetch<RosterEntry[]>(`/attendance/lectures/${lecture.id}/roster`)
      .then((data) => {
        setRoster(data);
        setStatuses(Object.fromEntries(data.filter((r) => r.status).map((r) => [r.student.id, r.status as AttendanceStatus])));
        return data;
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : "Could not load the roster.");
        return [];
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setRoster(null);
    setStatuses({});
    setSearch("");
    setFullyMarkedRoster(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lecture?.id]);

  async function markAllPresent() {
    if (!lecture) return;
    setMarkingAll(true);
    setError(null);
    try {
      await apiFetch(`/attendance/lectures/${lecture.id}/mark-all-present`, { method: "POST" });
      const fresh = await load();
      onMarked();
      if (fresh.length > 0 && fresh.every((r) => r.status !== null)) setFullyMarkedRoster(fresh);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not mark everyone present.");
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleSave() {
    if (!lecture || !roster) return;
    const records = roster.filter((r) => statuses[r.student.id]).map((r) => ({ studentId: r.student.id, status: statuses[r.student.id] }));
    if (records.length === 0) {
      setError("Mark at least one student before saving.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/attendance/lectures/${lecture.id}/mark`, { method: "POST", body: JSON.stringify({ records }) });
      onMarked();
      const fresh = await load();
      if (fresh.length > 0 && fresh.every((r) => r.status !== null)) {
        setFullyMarkedRoster(fresh);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save attendance.");
    } finally {
      setSubmitting(false);
    }
  }

  const markedCount = roster ? roster.filter((r) => statuses[r.student.id]).length : 0;
  const visibleRoster = roster
    ? roster.filter((r) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return r.student.name.toLowerCase().includes(q) || r.student.studentCode.toLowerCase().includes(q);
      })
    : [];

  if (fullyMarkedRoster && lecture) {
    return (
      <Modal
        open={!!lecture}
        onClose={onClose}
        title="Attendance saved"
        description="Everyone's marked. Share the summary with your group, or close this."
        width="md"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success">
            {fullyMarkedRoster.length} of {fullyMarkedRoster.length} students marked for {lecture.subject.name}.
          </div>
          {template && <CopyMessageBox message={renderTemplate(template, attendanceMarkedVars(lecture, fullyMarkedRoster))} />}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={!!lecture}
      onClose={onClose}
      title={lecture ? `${lecture.subject.name} — ${lecture.batch.name}` : "Mark attendance"}
      description={lecture ? `${fmtDate(lecture.date)} · ${lecture.startTime}–${lecture.endTime} · ${lecture.faculty.fullName}` : undefined}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={markAllPresent} disabled={markingAll || loading}>
            {markingAll ? "Marking…" : "Mark all present"}
          </Button>
          <Button onClick={handleSave} disabled={submitting || loading}>
            {submitting ? "Saving…" : "Save attendance"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {loading && <p className="text-sm text-muted-foreground">Loading roster…</p>}

      {!loading && roster && roster.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
          No students enrolled in this batch on this date.
        </p>
      )}

      {!loading && roster && roster.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Input
              placeholder="Search students…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <p className="shrink-0 text-xs text-muted-foreground">
              {markedCount} of {roster.length} marked
            </p>
          </div>
          <div className="divide-y divide-border rounded-xl border border-border">
            {visibleRoster.map((r) => (
              <div key={r.student.id} className="flex flex-col gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{r.student.name}</p>
                  <p className="text-xs text-muted-foreground">{r.student.studentCode}</p>
                  {r.markedByName && r.markedAt && (
                    <p className="text-xs text-muted-foreground">
                      Marked by {r.markedByName} · {fmtTime(r.markedAt)}
                    </p>
                  )}
                </div>
                <AttendanceToggleGroup
                  value={statuses[r.student.id] ?? null}
                  onChange={(status) => setStatuses((prev) => ({ ...prev, [r.student.id]: status }))}
                />
              </div>
            ))}
            {visibleRoster.length === 0 && (
              <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">No students match &quot;{search}&quot;.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
