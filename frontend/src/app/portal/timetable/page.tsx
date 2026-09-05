"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { ICONS, IconChip, StaggerItem, StaggerList, PortalEmpty, PortalHeader } from "@/components/portal/PortalPieces";
import { formatDate, fmtTime12, todayInput } from "@/lib/format";
import { ATTENDANCE_STATUS_LABELS } from "@/lib/types";
import type { PortalLecture, PortalParentMeeting, PortalTimetable } from "@/lib/types";

const FILTERS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
] as const;

const PTM_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="8" cy="8" r="3" />
    <circle cx="16" cy="8" r="3" />
    <path d="M2.5 20v-1c0-2.3 2.1-4 5.5-4s5.5 1.7 5.5 4v1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12.5 15c.8-.4 1.7-.6 2.5-.6 3.4 0 5.5 1.7 5.5 4v1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

type DayItem = { startTime: string } & (
  | { kind: "lecture"; lecture: PortalLecture }
  | { kind: "ptm"; meeting: PortalParentMeeting }
);

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
  // lectures and PTMs interleaved by time, the same shape a parent expects
  // from a single "what's on for my kid's batch" view.
  const days = useMemo(() => {
    if (!data) return [];
    const today = todayInput();

    const items: (DayItem & { date: string })[] = [
      ...data.lectures.map((lecture): DayItem & { date: string } => ({
        kind: "lecture",
        lecture,
        date: lecture.date.slice(0, 10),
        startTime: lecture.startTime,
      })),
      ...data.parentMeetings.map((meeting): DayItem & { date: string } => ({
        kind: "ptm",
        meeting,
        date: meeting.date.slice(0, 10),
        startTime: meeting.startTime,
      })),
    ];

    const filtered = items.filter((i) => (filter === "upcoming" ? i.date >= today : i.date < today));
    filtered.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    if (filter === "past") filtered.reverse();

    const groups = new Map<string, (DayItem & { date: string })[]>();
    for (const i of filtered) {
      const existing = groups.get(i.date);
      if (existing) existing.push(i);
      else groups.set(i.date, [i]);
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
          {days.map(([day, items]) => (
            <section key={day}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {formatDate(day, { weekday: true })}
              </p>
              <StaggerList>
                {items.map((item) =>
                  item.kind === "ptm" ? (
                    <StaggerItem
                      key={`ptm-${item.meeting.id}`}
                      className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 p-3"
                    >
                      <IconChip>{PTM_ICON}</IconChip>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.meeting.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {fmtTime12(item.meeting.startTime)}–{fmtTime12(item.meeting.endTime)}
                          {item.meeting.venue && ` · ${item.meeting.venue}`}
                        </p>
                      </div>
                      <Badge tone="accent">PTM</Badge>
                    </StaggerItem>
                  ) : (
                    <StaggerItem
                      key={item.lecture.id}
                      className={`flex items-center gap-3 rounded-xl border bg-card p-3 shadow-(--shadow-card) ${
                        item.lecture.cancelled ? "border-danger/30 opacity-70" : "border-border"
                      }`}
                    >
                      <IconChip>{item.lecture.kind === "TEST" ? ICONS.medal : ICONS.book}</IconChip>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium text-foreground ${item.lecture.cancelled ? "line-through" : ""}`}>
                          {item.lecture.kind === "TEST" && item.lecture.test ? item.lecture.test.title : item.lecture.subject}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {fmtTime12(item.lecture.startTime)}–{fmtTime12(item.lecture.endTime)} · {item.lecture.faculty}
                          {item.lecture.kind === "TEST" && ` · ${item.lecture.subject}`}
                        </p>
                        {item.lecture.cancelled && item.lecture.cancelReason && (
                          <p className="mt-0.5 truncate text-xs text-danger">{item.lecture.cancelReason}</p>
                        )}
                        {!item.lecture.cancelled && item.lecture.note && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.lecture.note}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <AttendanceChip lecture={item.lecture} />
                      </div>
                    </StaggerItem>
                  )
                )}
              </StaggerList>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
