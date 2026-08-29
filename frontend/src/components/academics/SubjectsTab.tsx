"use client";

import { forwardRef, useEffect, useImperativeHandle, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { Modal } from "@/components/ui/Modal";
import type { Course, Subject } from "@/lib/types";
import type { AcademicsTabHandle } from "./tabHandle";

export const SubjectsTab = forwardRef<AcademicsTabHandle>(function SubjectsTab(_props, ref) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [courseFilter, setCourseFilter] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, c] = await Promise.all([
        apiFetch<Subject[]>("/academics/subjects"),
        apiFetch<Course[]>("/academics/courses"),
      ]);
      setSubjects(s);
      setCourses(c);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load subjects.");
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

  function openEdit(subject: Subject) {
    setEditing(subject);
    setModalOpen(true);
  }

  const activeCount = subjects.filter((s) => s.isActive).length;
  const unlinkedCount = subjects.filter((s) => s.courses.length === 0).length;

  const visible = courseFilter
    ? subjects.filter((s) => s.courses.some((c) => c.id === courseFilter))
    : subjects;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total subjects" value={subjects.length} tone="primary" />
        <StatCard label="Active" value={activeCount} tone="success" />
        <StatCard label="Not linked to a course" value={unlinkedCount} tone="warning" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="w-full max-w-xs">
            <Dropdown
              value={courseFilter}
              onChange={setCourseFilter}
              options={[{ value: "", label: "All courses" }, ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))]}
              placeholder="All courses"
            />
          </div>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Linked courses</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {s.name} <span className="text-muted-foreground">· {s.shortCode}</span>
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {s.courses.length === 0 && <span className="text-xs text-muted-foreground">Not linked</span>}
                      {s.courses.map((c) => (
                        <Badge key={c.id} tone="primary">
                          {c.code}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" onClick={() => openEdit(s)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {courseFilter ? "No subjects linked to this course." : "No subjects yet — create the first one."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {visible.map((s) => (
            <div key={s.id} className="space-y-2 p-4" onClick={() => openEdit(s)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.shortCode}</p>
                </div>
                <Badge tone={s.isActive ? "success" : "danger"}>{s.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {s.courses.length === 0 && <span className="text-xs text-muted-foreground">Not linked to a course</span>}
                {s.courses.map((c) => (
                  <Badge key={c.id} tone="primary">
                    {c.code}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {!loading && visible.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {courseFilter ? "No subjects linked to this course." : "No subjects yet — create the first one."}
            </p>
          )}
        </div>
      </div>

      <SubjectModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} editing={editing} courses={courses} />
    </div>
  );
});

function SubjectModal({
  open,
  onClose,
  onSaved,
  editing,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Subject | null;
  courses: Course[];
}) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [courseIds, setCourseIds] = useState<Set<string>>(new Set());
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setShortCode(editing?.shortCode ?? "");
    setCourseIds(new Set(editing?.courses.map((c) => c.id) ?? []));
    setIsActive(editing?.isActive ?? true);
    setError(null);
  }, [open, editing]);

  function toggleCourse(id: string) {
    setCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = { name, shortCode, courseIds: Array.from(courseIds) };

    try {
      if (editing) {
        await apiFetch(`/academics/subjects/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ...payload, isActive }),
        });
      } else {
        await apiFetch("/academics/subjects", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save subject.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "New subject"}
      description="A subject can apply to more than one course — e.g. Physics for both 11th and 12th."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="subject-form" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Create subject"}
          </Button>
        </>
      }
    >
      <form id="subject-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Subject name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Physics" />
          <Input
            label="Short code"
            required
            value={shortCode}
            onChange={(e) => setShortCode(e.target.value.toUpperCase())}
            placeholder="PHY"
            minLength={1}
            maxLength={6}
            className="uppercase"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Courses</p>
          {/* Inactive courses aren't offered as NEW links, but one already linked (from
              before it was deactivated) stays visible so it can still be seen/unchecked
              — see changes-phase8.md §8b. */}
          {(() => {
            const pickable = courses.filter((c) => c.isActive || courseIds.has(c.id));
            return pickable.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create a course first to link subjects to it.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {pickable.map((c) => (
                  <label
                    key={c.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      courseIds.has(c.id) ? "border-primary bg-secondary text-secondary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    <input type="checkbox" className="accent-primary" checked={courseIds.has(c.id)} onChange={() => toggleCourse(c.id)} />
                    {c.name}
                    {!c.isActive && <span className="text-xs text-muted-foreground">(inactive)</span>}
                  </label>
                ))}
              </div>
            );
          })()}
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
