"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { StudentAnalyticsModal } from "@/components/analytics/StudentAnalyticsModal";
import { todayInput } from "@/lib/format";
import type { StudentAnalyticsListResponse, StudentAnalyticsFlag } from "@/lib/types";

function monthsAgoInput(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return todayInput(d);
}

const FLAG_LABEL: Record<StudentAnalyticsFlag, string> = {
  LOW_ATTENDANCE: "Low attendance",
  DECLINING_SCORES: "Declining scores",
};

type FlagFilter = "ALL" | "FLAGGED";

export function StudentAnalyticsTab() {
  // Empty until mount — see the matching comment in InstituteAnalyticsTab
  // for why an IST-computed default can't be the useState initializer here.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("ALL");
  const [data, setData] = useState<StudentAnalyticsListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openStudent, setOpenStudent] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    setFrom(monthsAgoInput(3));
    setTo(todayInput());
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    apiFetch<StudentAnalyticsListResponse>(`/analytics/students?from=${from}&to=${to}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load student analytics."))
      .finally(() => setLoading(false));
  }, [from, to]);

  const rows = useMemo(() => {
    const all = data?.students ?? [];
    const searched = search.trim()
      ? all.filter((r) => r.student.name.toLowerCase().includes(search.trim().toLowerCase()) || r.student.studentCode.toLowerCase().includes(search.trim().toLowerCase()))
      : all;
    return flagFilter === "FLAGGED" ? searched.filter((r) => r.flags.length > 0) : searched;
  }, [data, search, flagFilter]);

  const flaggedCount = (data?.students ?? []).filter((r) => r.flags.length > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="min-w-[200px] flex-1">
          <Input label="Search" placeholder="Name or student code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Active students" value={data?.students.length ?? 0} tone="primary" />
        <StatCard label="Flagged" value={flaggedCount} tone="danger" />
        <div className="col-span-2 flex items-center gap-1.5 sm:col-span-1">
          {(["ALL", "FLAGGED"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFlagFilter(f)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                flagFilter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f === "ALL" ? "All students" : "Flagged only"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Student</th>
              <th className="px-4 py-2.5 font-medium">Course</th>
              <th className="px-4 py-2.5 font-medium">Attendance</th>
              <th className="px-4 py-2.5 font-medium">Test average</th>
              <th className="px-4 py-2.5 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {flagFilter === "FLAGGED" ? "No flagged students in this range." : "No active students found."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.student.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted"
                  onClick={() => setOpenStudent({ id: r.student.id, name: r.student.name })}
                >
                  <td className="px-4 py-2.5 font-medium text-foreground">
                    {r.student.name} <span className="font-normal text-muted-foreground">· {r.student.studentCode}</span>
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{r.student.course.name}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.attendancePercent !== null ? `${r.attendancePercent}%` : "—"}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.testAveragePercent !== null ? `${r.testAveragePercent}%` : "—"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {r.flags.map((f) => (
                        <Badge key={f} tone="danger">
                          {FLAG_LABEL[f]}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <StudentAnalyticsModal
        studentId={openStudent?.id ?? null}
        studentName={openStudent?.name ?? ""}
        from={from}
        to={to}
        onClose={() => setOpenStudent(null)}
      />
    </div>
  );
}
