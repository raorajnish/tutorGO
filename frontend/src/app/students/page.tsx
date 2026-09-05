"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Dropdown } from "@/components/ui/Dropdown";
import { StudentProfileModal } from "@/components/students/StudentProfileModal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { ExportButton } from "@/components/ui/ExportButton";
import type { Batch, Course, StudentsResponse } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

const STATUS_FILTERS = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "all", label: "All" },
] as const;

export default function StudentsPage() {
  const [data, setData] = useState<StudentsResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["id"]>("active");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Static lookup, loaded once — kept out of the debounced filter effect
  // below so typing a search term never re-fetches the course list.
  useEffect(() => {
    apiFetch<Course[]>("/academics/courses?active=true")
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setBatchId("");
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then(setBatches)
      .catch(() => setBatches([]));
    setBatchId("");
  }, [courseId]);

  function buildQuery() {
    const qs = new URLSearchParams({ status });
    if (search) qs.set("search", search);
    if (courseId) qs.set("courseId", courseId);
    if (batchId) qs.set("batchId", batchId);
    return qs;
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch<StudentsResponse>(`/students?${buildQuery().toString()}`));
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
  }, [search, status, courseId, batchId]);

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
        <StatCard label="Fee book value" value={data ? formatMoney(data.stats.feeBookValue) : "—"} tone="warning" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search name, code, phone, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="w-full max-w-50">
              <Dropdown
                value={courseId}
                onChange={setCourseId}
                options={[{ value: "", label: "All courses" }, ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))]}
                placeholder="All courses"
              />
            </div>
            <div className="w-full max-w-50">
              <Dropdown
                value={batchId}
                onChange={setBatchId}
                options={[{ value: "", label: "All batches" }, ...batches.map((b) => ({ value: b.id, label: b.name }))]}
                placeholder="All batches"
                disabled={!courseId}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
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
            <ExportButton path={`/students/export.csv?${buildQuery().toString()}`} filename="students.csv" title="Export student directory as CSV" />
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
              {loading ? (
                Array.from({ length: 6 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={5}>
                      <SkeletonRow avatar lines={2} />
                    </td>
                  </tr>
                ))
              ) : (
                <>
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
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No students found.
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {loading ? (
            Array.from({ length: 6 }, (_, i) => <SkeletonRow key={i} avatar lines={2} />)
          ) : (
            <>
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
              {students.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No students found.</p>}
            </>
          )}
        </div>
      </div>

      <StudentProfileModal studentId={selectedId} onClose={() => setSelectedId(null)} onChanged={load} />
    </div>
  );
}
