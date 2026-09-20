"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Dropdown } from "@/components/ui/Dropdown";
import { SkeletonRow } from "@/components/ui/Skeleton";
import type { Batch, Course, StudentListItem, StudentsResponse } from "@/lib/types";
import { Pagination, useClientPagination } from "@/components/ui/Pagination";
import { formatMoney } from "@/lib/money";

const DefaultersTab = dynamic(
  () => import("@/components/fees/DefaultersTab").then((m) => m.DefaultersTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const ReceiptsTab = dynamic(
  () => import("@/components/fees/ReceiptsTab").then((m) => m.ReceiptsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const PaymentProofsTab = dynamic(
  () => import("@/components/fees/PaymentProofsTab").then((m) => m.PaymentProofsTab),
  { loading: () => <div className="p-4"><SkeletonRow lines={5} /></div> }
);
const FeeAccountModal = dynamic(
  () => import("@/components/fees/FeeAccountModal").then((m) => m.FeeAccountModal)
);
const SetupFeeAccountModal = dynamic(
  () => import("@/components/fees/SetupFeeAccountModal").then((m) => m.SetupFeeAccountModal)
);
const CollectFeeModal = dynamic(
  () => import("@/components/fees/CollectFeeModal").then((m) => m.CollectFeeModal)
);

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "All" },
];

const FEE_ACCOUNT_OPTIONS = [
  { value: "all", label: "All" },
  { value: "set_up", label: "Set up" },
  { value: "not_set_up", label: "Not set up" },
];

const SORT_OPTIONS = [
  { value: "admissionDate_desc", label: "Admission date (newest first)" },
  { value: "admissionDate_asc", label: "Admission date (oldest first)" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
];

const TABS = [
  { id: "students", label: "Students" },
  { id: "overdue", label: "Defaulters" },
  { id: "receipts", label: "Receipts" },
  { id: "proofs", label: "Payment proofs" },
];

export default function FeesPage() {
  return (
    <Suspense fallback={null}>
      <FeesContent />
    </Suspense>
  );
}

function FeesContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("students");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [feeAccountFilter, setFeeAccountFilter] = useState("all");
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [sort, setSort] = useState("admissionDate_desc");
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [data, setData] = useState<StudentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [setupStudent, setSetupStudent] = useState<StudentListItem | null>(null);
  const [collectOpen, setCollectOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("open") === "collect" || searchParams.get("collect") === "true") {
      setCollectOpen(true);
    }
  }, [searchParams]);

  function load() {
    const qs = new URLSearchParams({ status, sort });
    if (search) qs.set("search", search);
    if (courseId) qs.set("courseId", courseId);
    if (batchId) qs.set("batchId", batchId);
    apiFetch<StudentsResponse>(`/students?${qs.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load students."));
  }

  useEffect(() => {
    apiFetch<Course[]>("/academics/courses").then(setCourses).catch(() => {});
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

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, courseId, batchId, sort]);

  const students = (data?.students ?? []).filter((s) => {
    if (feeAccountFilter === "set_up") return s.hasFeeAccount;
    if (feeAccountFilter === "not_set_up") return !s.hasFeeAccount;
    return true;
  });

  const { paginatedItems: paginatedStudents, paginationProps: studentsPaginationProps } = useClientPagination(students, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Fees</h1>
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">
            Fee accounts, installments, payments and receipts — search a student to view or set up their plan.
          </p>
        </div>
        <Button onClick={() => setCollectOpen(true)}>Collect fee</Button>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      {tab === "students" && (
        <div className="space-y-4">
          <Input
            placeholder="Search name, code, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-md"
          />

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <Dropdown label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
            <Dropdown label="Fee account" value={feeAccountFilter} onChange={setFeeAccountFilter} options={FEE_ACCOUNT_OPTIONS} />
            <Dropdown
              label="Class"
              value={courseId}
              onChange={setCourseId}
              options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
              placeholder="All classes"
            />
            <Dropdown
              label="Batch"
              value={batchId}
              onChange={setBatchId}
              options={batches.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={courseId ? "All batches" : "Select a class first"}
              disabled={!courseId}
            />
            <div className="col-span-2 sm:col-span-1">
              <Dropdown label="Sort by" value={sort} onChange={setSort} options={SORT_OPTIONS} />
            </div>
          </div>

          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 font-medium">Fee account</th>
                    <th className="px-4 py-3 font-medium">Pending fees</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted">
                      <td className="cursor-pointer px-4 py-3" onClick={() => setSelectedId(s.id)}>
                        <p className="font-medium text-foreground">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.studentCode}</p>
                      </td>
                      <td className="cursor-pointer px-4 py-3 text-foreground" onClick={() => setSelectedId(s.id)}>
                        {s.course.name} ({s.course.code})
                      </td>
                      <td className="cursor-pointer px-4 py-3 text-foreground" onClick={() => setSelectedId(s.id)}>
                        {s.currentBatch?.name ?? "—"}
                      </td>
                      <td className="cursor-pointer px-4 py-3" onClick={() => setSelectedId(s.id)}>
                        <Badge tone={s.hasFeeAccount ? "success" : "warning"}>{s.hasFeeAccount ? "Set up" : "Not set up"}</Badge>
                      </td>
                      <td className="cursor-pointer px-4 py-3 font-medium text-foreground" onClick={() => setSelectedId(s.id)}>
                        {s.hasFeeAccount && s.pendingFees != null ? formatMoney(s.pendingFees) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {s.hasFeeAccount ? (
                          <button type="button" onClick={() => setSelectedId(s.id)} className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80">
                            View
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSetupStudent(s)}
                            className="cursor-pointer rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            Set up fee account
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No students found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border sm:hidden">
              {paginatedStudents.map((s) => (
                <div key={s.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="cursor-pointer" onClick={() => setSelectedId(s.id)}>
                      <p className="font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.studentCode}</p>
                    </div>
                    <Badge tone={s.hasFeeAccount ? "success" : "warning"}>
                      {s.hasFeeAccount ? "Set up" : "Not set up"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{s.course.name} ({s.course.code}) · {s.currentBatch?.name ?? "No batch"}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Pending fees</p>
                      <p className="font-medium text-foreground">
                        {s.hasFeeAccount && s.pendingFees != null ? formatMoney(s.pendingFees) : "—"}
                      </p>
                    </div>
                    {s.hasFeeAccount ? (
                      <button
                        type="button"
                        onClick={() => setSelectedId(s.id)}
                        className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
                      >
                        View details
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSetupStudent(s)}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Set up fee account
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {students.length === 0 && (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No students found.
                </div>
              )}
            </div>

            {students.length > 0 && (
              <Pagination
                {...studentsPaginationProps}
                pageSizeOptions={[10, 20, 50]}
                className="border-t border-border bg-card/50"
              />
            )}
          </div>
        </div>
      )}

      {tab === "overdue" && <DefaultersTab onOpenStudent={setSelectedId} />}

      {tab === "receipts" && <ReceiptsTab />}
      {tab === "proofs" && <PaymentProofsTab />}

      <FeeAccountModal studentId={selectedId} onClose={() => setSelectedId(null)} />
      <CollectFeeModal open={collectOpen} onClose={() => setCollectOpen(false)} />

      {setupStudent && (
        <SetupFeeAccountModal
          open={setupStudent !== null}
          onClose={() => setSetupStudent(null)}
          onSaved={() => {
            load();
            setSelectedId(setupStudent.id);
          }}
          student={setupStudent}
        />
      )}
    </div>
  );
}
