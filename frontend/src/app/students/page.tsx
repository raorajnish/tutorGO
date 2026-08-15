"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { StudentProfileModal } from "@/components/students/StudentProfileModal";
import type { StudentsResponse } from "@/lib/types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_FILTERS = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "all", label: "All" },
] as const;

export default function StudentsPage() {
  const [data, setData] = useState<StudentsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["id"]>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ status });
      if (search) qs.set("search", search);
      setData(await apiFetch<StudentsResponse>(`/students?${qs.toString()}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load students.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  const students = data?.students ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Students</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every student on file, across every course and batch.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active students" value={data?.stats.activeStudents ?? "—"} tone="primary" />
        <StatCard label="Total on file" value={data?.stats.totalStudents ?? "—"} tone="accent" />
        <StatCard label="Active batches" value={data?.stats.activeBatches ?? "—"} tone="success" />
        <StatCard label="Fee book value" value={data ? `₹${data.stats.feeBookValue}` : "—"} tone="warning" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search name, code, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatus(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  status === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Batch</th>
                <th className="px-4 py-3 font-medium">Admitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.studentCode}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">{s.course.name} ({s.course.code})</td>
                  <td className="px-4 py-3 text-foreground">{s.currentBatch?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-foreground">{fmtDate(s.admissionDate)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                </tr>
              ))}
              {!loading && students.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No students found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {students.map((s) => (
            <div key={s.id} className="space-y-2 p-4" onClick={() => setSelectedId(s.id)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.studentCode}</p>
                </div>
                <Badge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {s.course.name} ({s.course.code}) · {s.currentBatch?.name ?? "No batch"}
              </p>
            </div>
          ))}
          {!loading && students.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No students found.</p>
          )}
        </div>
      </div>

      <StudentProfileModal studentId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
    </div>
  );
}
