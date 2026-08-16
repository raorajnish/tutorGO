"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { ScheduleLectureModal } from "@/components/attendance/ScheduleLectureModal";
import { MarkAttendanceModal } from "@/components/attendance/MarkAttendanceModal";
import { EditLectureModal } from "@/components/attendance/EditLectureModal";
import { CancelLectureModal } from "@/components/attendance/CancelLectureModal";
import { CopyLectureButton } from "@/components/attendance/CopyLectureButton";
import { FacultyLecturesView } from "@/components/attendance/FacultyLecturesView";
import type { Lecture, LectureSummary } from "@/lib/types";

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" strokeLinecap="round" />
    </svg>
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Local-calendar-date arithmetic throughout — never round-trip through
// toISOString()/local-Date mixing, which silently shifts the date by a day
// in any timezone ahead of UTC (e.g. IST) because setDate() mutates in local
// time while toISOString() serializes in UTC.
function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function fmtDateLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const today = todayInput();
  if (iso === today) return "Today";
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtTime12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function AttendancePage() {
  const { user } = useAuth();
  if (user?.role === "FACULTY") return <FacultyLecturesView />;
  return <StaffScheduleView />;
}

function StaffScheduleView() {
  const [date, setDate] = useState(todayInput());
  const [lectures, setLectures] = useState<LectureSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [markLecture, setMarkLecture] = useState<Lecture | null>(null);
  const [editLecture, setEditLecture] = useState<Lecture | null>(null);
  const [cancelLecture, setCancelLecture] = useState<Lecture | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LectureSummary[]>(`/attendance/summary?date=${date}`);
      setLectures(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load the schedule.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const totals = lectures.reduce(
    (acc, l) => ({
      expected: acc.expected + l.expected,
      present: acc.present + l.present,
      absent: acc.absent + l.absent,
      late: acc.late + l.late,
      unmarked: acc.unmarked + l.unmarked,
    }),
    { expected: 0, present: 0, absent: 0, late: 0, unmarked: 0 }
  );

  function shiftDate(days: number) {
    setDate(addDays(date, days));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule lectures and track daily attendance.
          </p>
        </div>
        <Button onClick={() => setScheduleOpen(true)}>Schedule lecture</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Lectures today" value={lectures.length} tone="primary" />
        <StatCard label="Expected" value={totals.expected} tone="accent" />
        <StatCard label="Present" value={totals.present} tone="success" />
        <StatCard label="Late" value={totals.late} tone="warning" />
        <StatCard label="Absent" value={totals.absent} tone="danger" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              aria-label="Previous day"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm font-medium text-foreground sm:inline">{fmtDateLabel(date)}</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[9.5rem]" />
            </div>
            <button
              type="button"
              onClick={() => shiftDate(1)}
              aria-label="Next day"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          {date !== todayInput() && (
            <Button variant="ghost" onClick={() => setDate(todayInput())}>
              Jump to today
            </Button>
          )}
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-[15%] px-4 py-3 font-medium">Time</th>
                <th className="w-[17%] px-4 py-3 font-medium">Batch</th>
                <th className="w-[13%] px-4 py-3 font-medium">Subject</th>
                <th className="w-[13%] px-4 py-3 font-medium">Faculty</th>
                <th className="w-[10%] px-4 py-3 font-medium">Marked</th>
                <th className="w-[30%] px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {lectures.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">
                    {fmtTime12(l.startTime)}–{fmtTime12(l.endTime)}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {l.batch.name} <span className="text-muted-foreground">· {l.batch.course.code}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{l.subject.name}</td>
                  <td className="px-4 py-3 text-foreground">{l.faculty.fullName}</td>
                  <td className="px-4 py-3">
                    {l.cancelled ? (
                      <Badge tone="danger">Cancelled</Badge>
                    ) : l.unmarked === 0 && l.expected > 0 ? (
                      <Badge tone="success">All marked</Badge>
                    ) : (
                      <Badge tone="warning">
                        {l.expected - l.unmarked}/{l.expected} marked
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {l.cancelled ? (
                        <>
                          <span className="text-xs text-muted-foreground" title={l.cancelReason ?? undefined}>
                            {l.cancelReason}
                          </span>
                          <CopyLectureButton lecture={l} />
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditLecture(l)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            aria-label="Reschedule"
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCancelLecture(l)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-danger/70 transition-colors hover:bg-danger-soft hover:text-danger"
                            aria-label="Cancel lecture"
                          >
                            <XCircleIcon />
                          </button>
                          <CopyLectureButton lecture={l} />
                          <Button variant="secondary" onClick={() => setMarkLecture(l)}>
                            Mark
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && lectures.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No lectures scheduled for this date.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {lectures.map((l) => (
            <div key={l.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {l.subject.name} · {l.batch.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtTime12(l.startTime)}–{fmtTime12(l.endTime)} · {l.faculty.fullName}
                  </p>
                </div>
                {l.cancelled ? (
                  <Badge tone="danger">Cancelled</Badge>
                ) : l.unmarked === 0 && l.expected > 0 ? (
                  <Badge tone="success">All marked</Badge>
                ) : (
                  <Badge tone="warning">
                    {l.expected - l.unmarked}/{l.expected}
                  </Badge>
                )}
              </div>
              {l.cancelled ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Reason: {l.cancelReason}</p>
                  <CopyLectureButton lecture={l} />
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditLecture(l)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    aria-label="Reschedule"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelLecture(l)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-danger/70 transition-colors hover:bg-danger-soft hover:text-danger"
                    aria-label="Cancel lecture"
                  >
                    <XCircleIcon />
                  </button>
                  <CopyLectureButton lecture={l} />
                  <Button variant="secondary" onClick={() => setMarkLecture(l)}>
                    Mark attendance
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!loading && lectures.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No lectures scheduled for this date.</p>
          )}
        </div>
      </div>

      <ScheduleLectureModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} onScheduled={load} defaultDate={date} />

      <MarkAttendanceModal lecture={markLecture} onClose={() => setMarkLecture(null)} onMarked={load} />

      <EditLectureModal lecture={editLecture} onClose={() => setEditLecture(null)} onSaved={load} />

      <CancelLectureModal lecture={cancelLecture} onClose={() => setCancelLecture(null)} onCancelled={load} />
    </div>
  );
}
