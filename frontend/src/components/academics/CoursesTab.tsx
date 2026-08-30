"use client";

import { forwardRef, useEffect, useImperativeHandle, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Modal } from "@/components/ui/Modal";
import type { Course, CourseFeeMode } from "@/lib/types";
import type { AcademicsTabHandle } from "./tabHandle";

export const CoursesTab = forwardRef<AcademicsTabHandle>(function CoursesTab(_props, ref) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setCourses(await apiFetch<Course[]>("/academics/courses"));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load courses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  useImperativeHandle(ref, () => ({ openCreate }));

  function openEdit(course: Course) {
    setEditing(course);
    setModalOpen(true);
  }

  const activeCount = courses.filter((c) => c.isActive).length;
  const totalStudents = courses.reduce((sum, c) => sum + c.studentCount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total courses" value={courses.length} tone="primary" />
        <StatCard label="Active" value={activeCount} tone="success" />
        <StatCard label="Students enrolled" value={totalStudents} tone="accent" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-sm font-medium text-foreground">All courses</p>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Subjects</th>
                <th className="px-4 py-3 font-medium">Batches</th>
                <th className="px-4 py-3 font-medium">Students</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {c.name} <span className="text-muted-foreground">· {c.code}</span>
                    </p>
                    {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-foreground">{c.durationMonths ? `${c.durationMonths} months` : "—"}</td>
                  <td className="px-4 py-3 text-foreground">{c.subjectCount}</td>
                  <td className="px-4 py-3 text-foreground">{c.batchCount}</td>
                  <td className="px-4 py-3 text-foreground">{c.studentCount}</td>
                  <td className="px-4 py-3">
                    <Badge tone={c.isActive ? "success" : "danger"}>{c.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" onClick={() => openEdit(c)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && courses.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No courses yet — create the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {courses.map((c) => (
            <div key={c.id} className="space-y-2 p-4" onClick={() => openEdit(c)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.code}</p>
                </div>
                <Badge tone={c.isActive ? "success" : "danger"}>{c.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {c.subjectCount} subjects · {c.batchCount} batches · {c.studentCount} students
              </p>
            </div>
          ))}
          {!loading && courses.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No courses yet — create the first one.</p>
          )}
        </div>
      </div>

      <CourseModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} editing={editing} />
    </div>
  );
});

function CourseModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Course | null;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [code, setCode] = useState(editing?.code ?? "");
  const [durationMonths, setDurationMonths] = useState(editing?.durationMonths ? String(editing.durationMonths) : "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [feeMode, setFeeMode] = useState<CourseFeeMode>(editing?.feeMode ?? "FLAT");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Guard A (changes-phase8.md §8c): once a course has students or fee
  // structures, switching mode would silently empty every roster it owns,
  // because StudentSubject rows only ever get written at fee-account creation.
  const feeModeLocked = editing?.feeModeLocked ?? false;

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setCode(editing?.code ?? "");
    setDurationMonths(editing?.durationMonths ? String(editing.durationMonths) : "");
    setDescription(editing?.description ?? "");
    setIsActive(editing?.isActive ?? true);
    setFeeMode(editing?.feeMode ?? "FLAT");
    setError(null);
  }, [open, editing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      code,
      durationMonths: durationMonths ? Number(durationMonths) : undefined,
      description: description || undefined,
      // Omitted when locked so an unchanged edit never trips the server guard.
      feeMode: feeModeLocked ? undefined : feeMode,
    };

    try {
      if (editing) {
        await apiFetch(`/academics/courses/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, isActive }),
        });
      } else {
        await apiFetch("/academics/courses", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save course.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "New course"}
      description="A course doubles as your class/standard — e.g. “10th Standard” with code “10”."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="course-form" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Create course"}
          </Button>
        </>
      }
    >
      <form id="course-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Course name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="10th Standard" />
          <Input
            label="Code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="10"
            minLength={2}
            maxLength={8}
            className="uppercase"
          />
        </div>

        <Input
          label="Duration (months, optional)"
          type="number"
          min={1}
          value={durationMonths}
          onChange={(e) => setDurationMonths(e.target.value)}
        />

        <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">Fee mode</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            {(
              [
                { value: "FLAT", label: "Flat fee", hint: "One course fee for everyone" },
                { value: "SUBJECT_WISE", label: "Subject-wise", hint: "Fee is the sum of subjects taken" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={feeModeLocked}
                onClick={() => setFeeMode(opt.value)}
                className={`flex-1 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                  feeMode === opt.value ? "border-accent bg-accent/10" : "border-border bg-card hover:bg-secondary"
                } ${feeModeLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <span className={`block text-sm font-medium ${feeMode === opt.value ? "text-accent" : "text-foreground"}`}>
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
              </button>
            ))}
          </div>
          {feeModeLocked && (
            <p className="text-xs text-muted-foreground">
              This course already has students or fee structures, so its fee mode is fixed. Create a new course to use a
              different pricing model.
            </p>
          )}
          {!feeModeLocked && feeMode === "SUBJECT_WISE" && (
            <p className="text-xs text-muted-foreground">
              Add this course&apos;s subjects first, then price every one of them on its fee structure — use ₹0 for
              complementary subjects.
            </p>
          )}
        </div>

        {editing && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-primary" />
            Active
          </label>
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
