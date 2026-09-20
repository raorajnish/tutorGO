"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { AdmitModal } from "@/components/admissions/AdmitModal";
import { SelfFillTab } from "@/components/admissions/SelfFillTab";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImportButton } from "@/components/ui/ImportButton";
import { ImportModal } from "@/components/ui/ImportModal";
import { ENQUIRY_SOURCE_LABELS, type Course, type Enquiry, type StudentListItem } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";
import { Pagination, useClientPagination } from "@/components/ui/Pagination";
import { clearQuickActionQuery } from "@/lib/urlClean";

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
  const router = useRouter();

  const [tab, setTab] = useState<"pipeline" | "admitted" | "selfFill">("admitted");
  const [pipeline, setPipeline] = useState<Enquiry[]>([]);
  const [admitted, setAdmitted] = useState<StudentListItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [admitOpen, setAdmitOpen] = useState(false);
  const [admitEnquiry, setAdmitEnquiry] = useState<Enquiry | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { paginatedItems: paginatedPipeline, paginationProps: pipelinePaginationProps } = useClientPagination(pipeline, 10);
  const { paginatedItems: paginatedAdmitted, paginationProps: admittedPaginationProps } = useClientPagination(admitted, 10);

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
    if (searchParams.get("admit") === "true" || searchParams.get("open") === "create") {
      setAdmitEnquiry(null);
      setAdmitOpen(true);
      return;
    }
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
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">Admit directly, or convert an open enquiry into a student.</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton title="Bulk import students from CSV" onClick={() => setImportOpen(true)} />
          <Button onClick={openAdmitDirect}>Admit directly</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4">
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
                  {loading && Array.from({ length: 5 }, (_, i) => (
                    <tr key={`sk-${i}`}>
                      <td colSpan={5}>
                        <SkeletonRow lines={2} />
                      </td>
                    </tr>
                  ))}
                  {!loading && paginatedPipeline.map((e) => (
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
                      <td colSpan={5}>
                        <EmptyState message="No open enquiries." actionLabel="Capture enquiry" onAction={() => router.push("/enquiries")} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border sm:hidden">
              {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
              {!loading && paginatedPipeline.map((e) => (
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
                <EmptyState message="No open enquiries." actionLabel="Capture enquiry" onAction={() => router.push("/enquiries")} />
              )}
            </div>

            {!loading && pipeline.length > 0 && (
              <Pagination
                {...pipelinePaginationProps}
                pageSizeOptions={[10, 20, 50]}
                className="border-t border-border bg-card/50"
              />
            )}
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
                  {loading && Array.from({ length: 5 }, (_, i) => (
                    <tr key={`sk-${i}`}>
                      <td colSpan={5}>
                        <SkeletonRow avatar lines={2} />
                      </td>
                    </tr>
                  ))}
                  {!loading && paginatedAdmitted.map((s) => (
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
                      <td colSpan={5}>
                        <EmptyState message="No students admitted yet." actionLabel="Admit directly" onAction={openAdmitDirect} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border sm:hidden">
              {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} avatar lines={2} />)}
              {!loading && paginatedAdmitted.map((s) => (
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
                <EmptyState message="No students admitted yet." actionLabel="Admit directly" onAction={openAdmitDirect} />
              )}
            </div>

            {!loading && admitted.length > 0 && (
              <Pagination
                {...admittedPaginationProps}
                pageSizeOptions={[10, 20, 50]}
                className="border-t border-border bg-card/50"
              />
            )}
          </>
        )}
      </div>

      <AdmitModal
        open={admitOpen}
        onClose={() => {
          clearQuickActionQuery();
          setAdmitOpen(false);
        }}
        onAdmitted={load}
        courses={courses}
        enquiry={admitEnquiry}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import students"
        description="Upload a CSV to admit many students at once — nothing is created until you confirm the preview."
        templatePath="/students/import/template.csv"
        templateFilename="student-import-template.csv"
        importPath="/students/import"
        onImported={load}
        extraColumnLabel="Student ID"
        extraColumnValue={(row) => row.studentCode ?? ""}
      />
    </div>
  );
}
