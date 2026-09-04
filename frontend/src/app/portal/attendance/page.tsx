"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { ICONS, IconChip, StaggerGrid, StaggerItem, StaggerList, PortalEmpty, PortalHeader, PortalStat } from "@/components/portal/PortalPieces";
import { formatDate, fmtTime12 } from "@/lib/format";
import { ATTENDANCE_STATUS_LABELS } from "@/lib/types";
import type { AttendanceStatus, PortalAttendance } from "@/lib/types";

const TONE: Record<AttendanceStatus, "success" | "danger" | "warning" | "neutral"> = {
  PRESENT: "success",
  PRESENT_BIOMETRIC: "success",
  LATE: "warning",
  ABSENT: "danger",
  LEAVE: "neutral",
  HOLIDAY: "neutral",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "absent", label: "Absent" },
  { id: "late", label: "Late" },
] as const;

export default function PortalAttendancePage() {
  const [data, setData] = useState<PortalAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  useEffect(() => {
    apiFetch<PortalAttendance>("/portal/attendance")
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load your attendance."));
  }, []);

  const records = useMemo(() => {
    const all = data?.records ?? [];
    if (filter === "absent") return all.filter((r) => r.status === "ABSENT");
    if (filter === "late") return all.filter((r) => r.status === "LATE");
    return all;
  }, [data, filter]);

  const rate = data?.stats.rate ?? null;

  return (
    <div className="space-y-6">
      <PortalHeader eyebrow="My learning" title="Attendance" subtitle="Every class you've been marked for." />

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {!data ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-28 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <>
          <StaggerGrid className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PortalStat
              emphasis
              icon={ICONS.check}
              label="Attendance rate"
              value={rate === null ? "—" : `${rate}%`}
              sub={`${data.stats.present} of ${data.stats.total} classes`}
            />
            <PortalStat icon={ICONS.check} label="Present" value={data.stats.present} sub="Includes late arrivals" />
            <PortalStat icon={ICONS.clock} label="Absent" value={data.stats.absent} sub="Classes missed" />
            <PortalStat icon={ICONS.book} label="Leave" value={data.stats.leave} sub="Approved absences" />
          </StaggerGrid>

          {/* A single honest progress bar — the number most parents open this
              page for, made legible at a glance. */}
          {rate !== null && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-(--shadow-card)">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Overall</span>
                <span className="font-display text-lg font-semibold text-foreground">{rate}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    rate >= 75 ? "bg-success" : rate >= 60 ? "bg-warning" : "bg-danger"
                  }`}
                  style={{ width: `${rate}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Holidays aren&apos;t counted. Late arrivals count as present.
              </p>
            </div>
          )}

          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  filter === f.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {records.length === 0 ? (
            <PortalEmpty
              title={filter === "all" ? "No attendance recorded yet" : "Nothing here"}
              hint={filter === "all" ? "Records appear once your faculty marks a class." : "Good news, really."}
            />
          ) : (
            <StaggerList>
              {records.map((r) => (
                <StaggerItem
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-(--shadow-card)"
                >
                  <IconChip>{r.kind === "TEST" ? ICONS.medal : ICONS.book}</IconChip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(r.date, { weekday: true, year: false })} · {fmtTime12(r.startTime)} · {r.batch}
                    </p>
                  </div>
                  <Badge tone={TONE[r.status]}>{ATTENDANCE_STATUS_LABELS[r.status]}</Badge>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </>
      )}
    </div>
  );
}
