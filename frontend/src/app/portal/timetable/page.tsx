"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { ICONS, IconChip, StaggerItem, StaggerList, PortalEmpty, PortalHeader } from "@/components/portal/PortalPieces";
import { formatDate, fmtTime12, todayInput } from "@/lib/format";
import { ATTENDANCE_STATUS_LABELS } from "@/lib/types";
import type { PortalLecture, PortalTimetable } from "@/lib/types";

const FILTERS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
] as const;

/** The lecture's own attendance, once marked — shown inline so a student can
 * see "I was marked absent for that one" without opening another screen. */
function AttendanceChip({ lecture }: { lecture: PortalLecture }) {
  if (lecture.cancelled) return <Badge tone="danger">Cancelled</Badge>;
  if (!lecture.attendanceStatus) return null;
  const present =
    lecture.attendanceStatus === "PRESENT" ||
    lecture.attendanceStatus === "PRESENT_BIOMETRIC" ||
    lecture.attendanceStatus === "LATE";
  return (
    <Badge tone={present ? "success" : lecture.attendanceStatus === "ABSENT" ? "danger" : "neutral"}>
      {ATTENDANCE_STATUS_LABELS[lecture.attendanceStatus]}
    </Badge>
  );
}

export default function PortalTimetablePage() {
  const [data, setData] = useState<PortalTimetable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("upcoming");

  useEffect(() => {
    apiFetch<PortalTimetable>("/portal/timetable")
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load your timetable."));
  }, []);

  // Grouped by day so the list reads like a schedule rather than a flat feed —
  // the same shape the reference design uses under its calendar.
  const days = useMemo(() => {
    if (!data) return [];
    const today = todayInput();
    const filtered = data.lectures.filter((l) => {
      const day = l.date.slice(0, 10);
      return filter === "upcoming" ? day >= today : day < today;
    });
    if (filter === "past") filtered.reverse();

    const groups = new Map<string, PortalLecture[]>();
    for (const l of filtered) {
      const key = l.date.slice(0, 10);
      const existing = groups.get(key);
      if (existing) existing.push(l);
      else groups.set(key, [l]);
    }
    return [...groups.entries()];
  }, [data, filter]);

  return (
    <div className="space-y-6">
      <PortalHeader
        eyebrow="My learning"
        title="Timetable"
        subtitle={data?.batch ? `${data.batch.name} · the four weeks either side of today` : undefined}
      />

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonBlock key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data.batch ? (
        <PortalEmpty title="You're not in a batch yet" hint="Your timetable appears once your institute places you in one." />
      ) : days.length === 0 ? (
        <PortalEmpty
          title={filter === "upcoming" ? "Nothing scheduled" : "No past classes in this window"}
          hint={filter === "upcoming" ? "New classes show up here as soon as they're added." : undefined}
        />
      ) : (
        <div className="space-y-5">
          {days.map(([day, lectures]) => (
            <section key={day}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatDate(day, { weekday: true })}
              </p>
              <StaggerList>
                {lectures.map((l) => (
                  <StaggerItem
                    key={l.id}
                    className={`flex items-center gap-3 rounded-xl border bg-card p-3 shadow-(--shadow-card) ${
                      l.cancelled ? "border-danger/30 opacity-70" : "border-border"
                    }`}
                  >
                    <IconChip>{l.kind === "TEST" ? ICONS.medal : ICONS.book}</IconChip>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium text-foreground ${l.cancelled ? "line-through" : ""}`}>
                        {l.kind === "TEST" && l.test ? l.test.title : l.subject}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {fmtTime12(l.startTime)}–{fmtTime12(l.endTime)} · {l.faculty}
                        {l.kind === "TEST" && ` · ${l.subject}`}
                      </p>
                      {l.cancelled && l.cancelReason && (
                        <p className="mt-0.5 truncate text-xs text-danger">{l.cancelReason}</p>
                      )}
                      {!l.cancelled && l.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">{l.note}</p>}
                    </div>
                    <div className="shrink-0">
                      <AttendanceChip lecture={l} />
                    </div>
                  </StaggerItem>
                ))}
              </StaggerList>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
