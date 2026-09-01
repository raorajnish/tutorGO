"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { ScheduleLectureModal } from "@/components/attendance/ScheduleLectureModal";
import { MarkAttendanceModal } from "@/components/attendance/MarkAttendanceModal";
import { EditLectureModal } from "@/components/attendance/EditLectureModal";
import { CancelLectureModal } from "@/components/attendance/CancelLectureModal";
import { CopyLectureButton } from "@/components/attendance/CopyLectureButton";
import type { AttendanceStats, Lecture } from "@/lib/types";
import { formatDate, fmtTime12, todayInput } from "@/lib/format";

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

function fmtDate(iso: string) {
  return formatDate(iso, { weekday: true });
}


const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "history", label: "History" },
] as const;

export function FacultyLecturesView() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("upcoming");
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
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
      const [s, l] = await Promise.all([
        apiFetch<AttendanceStats>("/attendance/stats"),
        apiFetch<Lecture[]>(`/attendance/lectures?scope=${tab}`),
      ]);
      setStats(s);
      setLectures(l);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load your lectures.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Attendance</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your lectures — schedule new ones and mark attendance.</p>
        </div>
        <Button onClick={() => setScheduleOpen(true)}>Schedule lecture</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total lectures" value={stats?.total ?? "—"} tone="primary" />
        <StatCard label="Today" value={stats?.today ?? "—"} tone="accent" />
        <StatCard label="Upcoming" value={stats?.upcoming ?? "—"} tone="success" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex gap-1.5 border-b border-border p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-[17%] px-4 py-3 font-medium">Date</th>
                <th className="w-[14%] px-4 py-3 font-medium">Time</th>
                <th className="w-[13%] px-4 py-3 font-medium">Batch</th>
                <th className="w-[11%] px-4 py-3 font-medium">Subject</th>
                <th className="w-[9%] px-4 py-3 font-medium">Marked</th>
                <th className="w-[36%] px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {lectures.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">{fmtDate(l.date)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-foreground">
                    {fmtTime12(l.startTime)}–{fmtTime12(l.endTime)}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {l.batch.name} <span className="text-muted-foreground">· {l.batch.course.code}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {l.subject.name}
                    {l.kind === "TEST" && (
                      <Badge tone="accent" className="ml-1.5">
                        Test
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {l.cancelled ? (
                      <Badge tone="danger">Cancelled</Badge>
                    ) : l.markedCount > 0 ? (
                      <Badge tone="success">Marked</Badge>
                    ) : (
                      <Badge tone="warning">Unmarked</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {l.kind === "TEST" ? (
                        <Link href={`/tests/${l.testId}`}>
                          <Button variant="secondary">{l.testTitle ?? "View test"}</Button>
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
                          {tab === "upcoming" && (
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
                            </>
                          )}
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
                    {tab === "upcoming" ? "No upcoming lectures scheduled." : "No past lectures yet."}
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
                    {l.kind === "TEST" && (
                      <Badge tone="accent" className="ml-1.5">
                        Test
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(l.date)} · {fmtTime12(l.startTime)}–{fmtTime12(l.endTime)}
                  </p>
                </div>
                {l.cancelled ? (
                  <Badge tone="danger">Cancelled</Badge>
                ) : l.markedCount > 0 ? (
                  <Badge tone="success">Marked</Badge>
                ) : (
                  <Badge tone="warning">Unmarked</Badge>
                )}
              </div>
              {l.kind === "TEST" ? (
                <Link href={`/tests/${l.testId}`}>
                  <Button variant="secondary" className="w-full">
                    {l.testTitle ?? "View test"}
                  </Button>
                </Link>
              ) : l.cancelled ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">Reason: {l.cancelReason}</p>
                  <CopyLectureButton lecture={l} />
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {tab === "upcoming" && (
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
                    </>
                  )}
                  <CopyLectureButton lecture={l} />
                  <Button variant="secondary" onClick={() => setMarkLecture(l)}>
                    Mark attendance
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!loading && lectures.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {tab === "upcoming" ? "No upcoming lectures scheduled." : "No past lectures yet."}
            </p>
          )}
        </div>
      </div>

      <ScheduleLectureModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} onScheduled={load} defaultDate={todayInput()} />

      <MarkAttendanceModal lecture={markLecture} onClose={() => setMarkLecture(null)} onMarked={load} />

      <EditLectureModal lecture={editLecture} onClose={() => setEditLecture(null)} onSaved={load} />

      <CancelLectureModal lecture={cancelLecture} onClose={() => setCancelLecture(null)} onCancelled={load} />
    </div>
  );
}
