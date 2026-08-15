"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Modal } from "@/components/ui/Modal";
import type { Batch, Course } from "@/lib/types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function BatchesTab() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [courseFilter, setCourseFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [b, c] = await Promise.all([
        apiFetch<Batch[]>("/academics/batches"),
        apiFetch<Course[]>("/academics/courses"),
      ]);
      setBatches(b);
      setCourses(c);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load batches.");
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

  function openEdit(batch: Batch) {
    setEditing(batch);
    setModalOpen(true);
  }

  const activeCount = batches.filter((b) => b.isActive).length;
  const totalEnrolled = batches.reduce((sum, b) => sum + b.enrolledCount, 0);

  const visible = courseFilter ? batches.filter((b) => b.course.id === courseFilter) : batches;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total batches" value={batches.length} tone="primary" />
        <StatCard label="Active" value={activeCount} tone="success" />
        <StatCard label="Students enrolled" value={totalEnrolled} tone="accent" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full max-w-xs">
            <Dropdown
              value={courseFilter}
              onChange={setCourseFilter}
              options={[{ value: "", label: "All courses" }, ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))]}
              placeholder="All courses"
            />
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={load}>
              Refresh
            </Button>
            <Button onClick={openCreate} disabled={courses.length === 0}>
              New batch
            </Button>
          </div>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}
        {!loading && courses.length === 0 && (
          <div className="border-b border-border bg-warning-soft px-4 py-2 text-sm text-warning">
            Create a course first — batches always belong to one.
          </div>
        )}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Batch</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Starts</th>
                <th className="px-4 py-3 font-medium">Ends</th>
                <th className="px-4 py-3 font-medium">Enrolled</th>
                <th className="px-4 py-3 font-medium">Lectures</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => (
                <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                  <td className="px-4 py-3 text-foreground">
                    {b.course.name} <span className="text-muted-foreground">· {b.course.code}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{fmtDate(b.startDate)}</td>
                  <td className="px-4 py-3 text-foreground">{b.endDate ? fmtDate(b.endDate) : "Ongoing"}</td>
                  <td className="px-4 py-3 text-foreground">{b.enrolledCount}</td>
                  <td className="px-4 py-3 text-foreground">{b.lectureCount}</td>
                  <td className="px-4 py-3">
                    <Badge tone={b.isActive ? "success" : "danger"}>{b.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" onClick={() => openEdit(b)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {courseFilter ? "No batches under this course." : "No batches yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {visible.map((b) => (
            <div key={b.id} className="space-y-2 p-4" onClick={() => openEdit(b)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{b.name}</p>
                  <p className="text-xs text-muted-foreground">{b.course.name} · {b.course.code}</p>
                </div>
                <Badge tone={b.isActive ? "success" : "danger"}>{b.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {fmtDate(b.startDate)} – {b.endDate ? fmtDate(b.endDate) : "Ongoing"}
              </p>
              <p className="text-xs text-muted-foreground">{b.enrolledCount} enrolled · {b.lectureCount} lectures</p>
            </div>
          ))}
          {!loading && visible.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {courseFilter ? "No batches under this course." : "No batches yet."}
            </p>
          )}
        </div>
      </div>

      <BatchModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} editing={editing} courses={courses} />
    </div>
  );
}

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

function BatchModal({
  open,
  onClose,
  onSaved,
  editing,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Batch | null;
  courses: Course[];
}) {
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setCourseId(editing?.course.id ?? courses[0]?.id ?? "");
    setStartDate(editing ? toDateInput(editing.startDate) : "");
    setEndDate(editing?.endDate ? toDateInput(editing.endDate) : "");
    setIsActive(editing?.isActive ?? true);
    setError(null);
  }, [open, editing, courses]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!courseId) {
      setError("Select a course.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      courseId,
      startDate,
      endDate: endDate || null,
    };

    try {
      if (editing) {
        await apiFetch(`/academics/batches/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, isActive }),
        });
      } else {
        await apiFetch("/academics/batches", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save batch.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "New batch"}
      description="Leave end date blank for an open-ended, ongoing batch."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="batch-form" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Create batch"}
          </Button>
        </>
      }
    >
      <form id="batch-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Batch name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Morning Batch A" />

        <Dropdown
          label="Course"
          value={courseId}
          onChange={setCourseId}
          options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          placeholder="Select course…"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Start date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="End date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
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
