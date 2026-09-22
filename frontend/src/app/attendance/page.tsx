"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { CopyLectureButton } from "@/components/attendance/CopyLectureButton";
import { ExportButton } from "@/components/ui/ExportButton";
import type { Lecture, LectureSummary } from "@/lib/types";
import { todayInput, fmtTime12, formatDate } from "@/lib/format";
import { Pagination, useClientPagination } from "@/components/ui/Pagination";

const FacultyLecturesView = dynamic(
  () => import("@/components/attendance/FacultyLecturesView").then((m) => m.FacultyLecturesView)
);
const ScheduleLectureModal = dynamic(
  () => import("@/components/attendance/ScheduleLectureModal").then((m) => m.ScheduleLectureModal)
);
const MarkAttendanceModal = dynamic(
  () => import("@/components/attendance/MarkAttendanceModal").then((m) => m.MarkAttendanceModal)
);
const StaffTimetableTab = dynamic(
  () => import("@/components/attendance/TimetableTab").then((m) => m.TimetableTab)
);

const EditLectureModal = dynamic(
  () => import("@/components/attendance/EditLectureModal").then((m) => m.EditLectureModal)
);
const CancelLectureModal = dynamic(
  () => import("@/components/attendance/CancelLectureModal").then((m) => m.CancelLectureModal)
);

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
// time while toISOString() serializes in UTC. todayInput() itself is pinned
// to Asia/Kolkata explicitly (see lib/format.ts) rather than trusting the
// browser's own timezone to already be IST.
function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function fmtDateLabel(iso: string) {
  const today = todayInput();
  if (iso === today) return "Today";
  return formatDate(iso, { weekday: true });
}

export default function AttendancePage() {
  return (
    <Suspense fallback={null}>
      <AttendanceContent />
    </Suspense>
  );
}

function AttendanceContent() {
  const { user } = useAuth();
  if (user?.role === "FACULTY") return <FacultyLecturesView />;
  return <StaffScheduleView />;
}

function StaffScheduleView() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"daily" | "timetable">("daily");
  const [date, setDate] = useState(todayInput());
  const [lectures, setLectures] = useState<LectureSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [markLecture, setMarkLecture] = useState<Lecture | null>(null);
  const [editLecture, setEditLecture] = useState<Lecture | null>(null);
  const [cancelLecture, setCancelLecture] = useState<Lecture | null>(null);

  useEffect(() => {
    if (searchParams.get("open") === "create" || searchParams.get("schedule") === "true") {
      setScheduleOpen(true);
    }
  }, [searchParams]);

  const { paginatedItems, paginationProps } = useClientPagination(lectures, 10);

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
    if (activeTab === "daily") {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, activeTab]);

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
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Attendance & Timetable</h1>
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
            Schedule lectures, view weekly timetable matrix, and track daily attendance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "daily" && (
            <Button onClick={() => setScheduleOpen(true)}>Schedule lecture</Button>
          )}
        </div>
      </div>

      <Tabs
        tabs={[
          { id: "daily", label: "Daily schedule & attendance" },
          { id: "timetable", label: "Weekly timetable" },
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as "daily" | "timetable")}
      />

      {activeTab === "timetable" ? (
        <StaffTimetableTab />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 sm:gap-4">
            <StatCard label="Lectures today" value={lectures.length} tone="primary" />
            <StatCard label="Present" value={totals.present} tone="success" />
            <StatCard label="Late" value={totals.late} tone="warning" />
            <StatCard label="Absent" value={totals.absent} tone="danger" />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3 sm:p-4">
              <div className="flex items-center gap-1.5 sm:gap-2">
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
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-[8.5rem] sm:w-[9.5rem]" />
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

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {date !== todayInput() && (
                  <Button variant="ghost" onClick={() => setDate(todayInput())} className="px-2 sm:px-3 text-xs sm:text-sm">
                    <span className="sm:hidden">Today</span>
                    <span className="hidden sm:inline">Jump to today</span>
                  </Button>
                )}
                <ExportButton
                  path={`/attendance/summary/export.csv?date=${date}`}
                  filename={`attendance-${date}.csv`}
                  title="Export this day's attendance as CSV"
                />
              </div>
            </div>

            {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[760px] table-fixed text-sm">
                <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-[15%] px-4 py-3 font-medium">Time</th>
                <th className="w-[18%] px-4 py-3 font-medium">Batch</th>
                <th className="w-[14%] px-4 py-3 font-medium">Subject</th>
                <th className="w-[14%] px-4 py-3 font-medium">Faculty</th>
                <th className="w-[9%] px-4 py-3 font-medium">Room</th>
                <th className="w-[14%] px-4 py-3 font-medium">Marked</th>
                <th className="w-[16%] px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={7}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
              {!loading && paginatedItems.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">
                    {fmtTime12(l.startTime)}–{fmtTime12(l.endTime)}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {l.batch.name} <span className="text-muted-foreground">· {l.batch.course.code}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="flex flex-wrap items-center gap-1">
                      <span>{l.subject.name}</span>
                      {l.kind === "TEST" && (
                        <Badge tone="accent" className="whitespace-nowrap" title={l.testTitle ?? undefined}>
                          Test{l.testTitle ? `: ${l.testTitle}` : ""}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">{l.faculty.fullName}</td>
                  <td className="px-4 py-3 text-foreground">
                    {l.room ? (
                      <span className="font-medium">{l.room.name}</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {l.cancelled ? (
                      <Badge tone="danger" className="whitespace-nowrap">Cancelled</Badge>
                    ) : l.unmarked === 0 && l.expected > 0 ? (
                      <Badge tone="success" className="whitespace-nowrap">All marked</Badge>
                    ) : (
                      <Badge tone="warning" className="whitespace-nowrap">
                        {l.expected - l.unmarked}/{l.expected} marked
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {l.kind === "TEST" ? (
                        <Link href={`/tests/${l.testId}`}>
                          <Button variant="secondary" className="whitespace-nowrap">View test</Button>
                        </Link>
                      ) : l.cancelled ? (
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
                  <td colSpan={7}>
                    <EmptyState
                      message="No lectures scheduled for this date."
                      actionLabel="Schedule lecture"
                      onAction={() => setScheduleOpen(true)}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border lg:hidden">
          {loading && Array.from({ length: 6 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
          {!loading && paginatedItems.map((l) => (
            <div key={l.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">
                    {l.subject.name} · {l.batch.name}
                    {l.kind === "TEST" && (
                      <Badge tone="accent" className="ml-1.5 whitespace-nowrap">
                        Test{l.testTitle ? `: ${l.testTitle}` : ""}
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmtTime12(l.startTime)}–{fmtTime12(l.endTime)} · {l.faculty.fullName}
                    {l.room && <span className="ml-1 text-accent font-medium">· 📍 {l.room.name}</span>}
                  </p>
                </div>
                {l.cancelled ? (
                  <Badge tone="danger" className="whitespace-nowrap">Cancelled</Badge>
                ) : l.unmarked === 0 && l.expected > 0 ? (
                  <Badge tone="success" className="whitespace-nowrap">All marked</Badge>
                ) : (
                  <Badge tone="warning" className="whitespace-nowrap">
                    {l.expected - l.unmarked}/{l.expected}
                  </Badge>
                )}
              </div>
              {l.kind === "TEST" ? (
                <Link href={`/tests/${l.testId}`}>
                  <Button variant="secondary" className="w-full">
                    View test
                  </Button>
                </Link>
              ) : l.cancelled ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Reason: {l.cancelReason}</p>
                  <CopyLectureButton lecture={l} />
                </div>
              ) : (
                <div className="flex items-center justify-end gap-1">
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
            <EmptyState
              message="No lectures scheduled for this date."
              actionLabel="Schedule lecture"
              onAction={() => setScheduleOpen(true)}
            />
          )}
        </div>

        {!loading && lectures.length > 0 && (
          <Pagination
            {...paginationProps}
            pageSizeOptions={[10, 20, 50]}
            className="border-t border-border bg-card/50"
          />
        )}
      </div>
      </>
      )}

      <ScheduleLectureModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} onScheduled={load} defaultDate={date} />

      <MarkAttendanceModal lecture={markLecture} onClose={() => setMarkLecture(null)} onMarked={load} />

      <EditLectureModal lecture={editLecture} onClose={() => setEditLecture(null)} onSaved={load} />

      <CancelLectureModal lecture={cancelLecture} onClose={() => setCancelLecture(null)} onCancelled={load} />
    </div>
  );
}
