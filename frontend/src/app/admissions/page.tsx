"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { AdmitModal } from "@/components/admissions/AdmitModal";
import { SelfFillTab } from "@/components/admissions/SelfFillTab";
import { ENQUIRY_SOURCE_LABELS, type Course, type Enquiry, type StudentListItem } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

function UsersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdmissionsPage() {
  return (
    <Suspense fallback={null}>
      <AdmissionsContent />
    </Suspense>
  );
}

function AdmissionsContent() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<"pipeline" | "admitted" | "selfFill">("admitted");
  const [pipeline, setPipeline] = useState<Enquiry[]>([]);
  const [admitted, setAdmitted] = useState<StudentListItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [admitOpen, setAdmitOpen] = useState(false);
  const [admitEnquiry, setAdmitEnquiry] = useState<Enquiry | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [newOnes, contacted, students, c] = await Promise.all([
        apiFetch<Enquiry[]>("/enquiries?status=NEW"),
        apiFetch<Enquiry[]>("/enquiries?status=CONTACTED"),
        apiFetch<{ students: StudentListItem[] }>("/students?status=all"),
        apiFetch<Course[]>("/academics/courses?active=true"),
      ]);
      const open = [...newOnes, ...contacted];
      setPipeline(open);
      setAdmitted(students.students);
      setCourses(c);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load admissions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const enquiryId = searchParams.get("enquiryId");
    if (!enquiryId || pipeline.length === 0) return;
    const found = pipeline.find((e) => e.id === enquiryId);
    if (found) {
      setAdmitEnquiry(found);
      setAdmitOpen(true);
    }
  }, [searchParams, pipeline]);

  function openAdmitDirect() {
    setAdmitEnquiry(null);
    setAdmitOpen(true);
  }

  function openAdmitFrom(enquiry: Enquiry) {
    setAdmitEnquiry(enquiry);
    setAdmitOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Admissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Admit directly, or convert an open enquiry into a student.</p>
        </div>
        <Button onClick={openAdmitDirect}>Admit directly</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Open in pipeline" value={pipeline.length} tone="primary" />
        <StatCard label="Admitted" value={admitted.length} tone="success" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-2 border-b border-border p-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab("admitted")}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                tab === "admitted" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              Admitted
            </button>
            <button
              type="button"
              onClick={() => setTab("pipeline")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                tab === "pipeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              Pipeline
              {pipeline.length > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none ${
                    tab === "pipeline" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-foreground"
                  }`}
                >
                  {pipeline.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab("selfFill")}
              className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                tab === "selfFill" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              Self-fill
            </button>
          </div>
          <Link
            href="/students"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <UsersIcon />
            Students directory
            <ArrowRightIcon />
          </Link>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        {tab === "selfFill" ? (
          <SelfFillTab courses={courses} />
        ) : tab === "pipeline" ? (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Lead</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeline.map((e) => (
                    <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-foreground">{e.course ? `${e.course.name} (${e.course.code})` : "—"}</td>
                      <td className="px-4 py-3 text-foreground">{ENQUIRY_SOURCE_LABELS[e.source]}</td>
                      <td className="px-4 py-3">
                        <Badge tone={e.status === "NEW" ? "primary" : "accent"}>{e.status === "NEW" ? "New" : "Contacted"}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="secondary" onClick={() => openAdmitFrom(e)}>
                          Admit
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!loading && pipeline.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No open enquiries. <Link href="/enquiries" className="text-primary underline underline-offset-2">Capture one</Link>.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border sm:hidden">
              {pipeline.map((e) => (
                <div key={e.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.phone}</p>
                    </div>
                    <Badge tone={e.status === "NEW" ? "primary" : "accent"}>{e.status === "NEW" ? "New" : "Contacted"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {e.course ? `${e.course.name} (${e.course.code})` : "No course"} · {ENQUIRY_SOURCE_LABELS[e.source]}
                  </p>
                  <Button variant="secondary" onClick={() => openAdmitFrom(e)}>
                    Admit
                  </Button>
                </div>
              ))}
              {!loading && pipeline.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">No open enquiries.</p>
              )}
            </div>
          </>
        ) : (
          <>
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
                  {admitted.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted">
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
                  {!loading && admitted.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No students admitted yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border sm:hidden">
              {admitted.map((s) => (
                <div key={s.id} className="space-y-1.5 p-4">
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
              {!loading && admitted.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">No students admitted yet.</p>
              )}
            </div>
          </>
        )}
      </div>

      <AdmitModal
        open={admitOpen}
        onClose={() => setAdmitOpen(false)}
        onAdmitted={load}
        courses={courses}
        enquiry={admitEnquiry}
      />
    </div>
  );
}
