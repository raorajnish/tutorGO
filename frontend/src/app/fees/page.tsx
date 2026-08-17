"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { Dropdown } from "@/components/ui/Dropdown";
import { FeeAccountModal } from "@/components/fees/FeeAccountModal";
import { SetupFeeAccountModal } from "@/components/fees/SetupFeeAccountModal";
import { DefaultersTab } from "@/components/fees/DefaultersTab";
import { ReceiptsTab } from "@/components/fees/ReceiptsTab";
import type { Batch, Course, StudentListItem, StudentsResponse } from "@/lib/types";

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
];

export default function FeesPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Fees</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fee accounts, installments, payments and receipts — search a student to view or set up their plan.
        </p>
      </div>

      <Tabs tabs={TABS} activeId={tab} onChange={setTab} />

      {tab === "students" && (
        <div className="space-y-4">
          <Input
            placeholder="Search name, code, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
            <Dropdown label="Sort by" value={sort} onChange={setSort} options={SORT_OPTIONS} />
          </div>

          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                    <th className="px-4 py-3 font-medium">Batch</th>
                    <th className="px-4 py-3 font-medium">Fee account</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
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
                      <td className="px-4 py-3">
                        {s.hasFeeAccount ? (
                          <button type="button" onClick={() => setSelectedId(s.id)} className="text-xs font-medium text-accent underline underline-offset-2 hover:text-accent/80">
                            View
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setSetupStudent(s)}
                            className="cursor-pointer rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
                          >
                            Set up fee account
                          </button>
                        )}
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
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "overdue" && <DefaultersTab onOpenStudent={setSelectedId} />}

      {tab === "receipts" && <ReceiptsTab />}

      <FeeAccountModal studentId={selectedId} onClose={() => setSelectedId(null)} />

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
