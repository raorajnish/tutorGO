"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { Course, FacultyAssignmentInput, FacultyCourseAssignment, Subject, TeamMember } from "@/lib/types";

interface Props {
  faculty: TeamMember | null;
  onClose: () => void;
}

interface CourseState {
  assigned: boolean;
  subjectIds: Set<string>; // empty = all subjects
}

export function FacultyAssignmentModal({ faculty, onClose }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [state, setState] = useState<Record<string, CourseState>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!faculty) return;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<Course[]>("/academics/courses"),
      apiFetch<Subject[]>("/academics/subjects"),
      apiFetch<FacultyCourseAssignment[]>(`/attendance/faculty/${faculty.id}/assignments`),
    ])
      .then(([allCourses, allSubjects, assignments]) => {
        setCourses(allCourses);
        setSubjects(allSubjects);
        const next: Record<string, CourseState> = {};
        for (const a of assignments) {
          next[a.course.id] = {
            assigned: true,
            subjectIds: a.allSubjects ? new Set() : new Set(a.subjects.map((s) => s.id)),
          };
        }
        setState(next);
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load assignments."))
      .finally(() => setLoading(false));
  }, [faculty]);

  function toggleCourse(courseId: string) {
    setState((prev) => {
      const current = prev[courseId];
      if (current?.assigned) {
        const rest = { ...prev };
        delete rest[courseId];
        return rest;
      }
      return { ...prev, [courseId]: { assigned: true, subjectIds: new Set() } };
    });
  }

  function toggleSubject(courseId: string, subjectId: string) {
    setState((prev) => {
      const current = prev[courseId] ?? { assigned: true, subjectIds: new Set<string>() };
      const nextSubjects = new Set(current.subjectIds);
      if (nextSubjects.has(subjectId)) nextSubjects.delete(subjectId);
      else nextSubjects.add(subjectId);
      return { ...prev, [courseId]: { assigned: true, subjectIds: nextSubjects } };
    });
  }

  async function handleSave() {
    if (!faculty) return;
    setSubmitting(true);
    setError(null);
    try {
      const assignments: FacultyAssignmentInput[] = Object.entries(state)
        .filter(([, s]) => s.assigned)
        .map(([courseId, s]) => ({ courseId, subjectIds: [...s.subjectIds] }));
      await apiFetch(`/attendance/faculty/${faculty.id}/assignments`, {
        method: "PUT",
        body: JSON.stringify({ assignments }),
      });
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save assignments.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={!!faculty}
      onClose={onClose}
      title={faculty ? `Teaching assignments — ${faculty.fullName}` : "Teaching assignments"}
      description="Leave a course's subjects unchecked to allow all of them. Faculty only see these courses/subjects when scheduling their own lectures."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting || loading}>
            {submitting ? "Saving…" : "Save assignments"}
          </Button>
        </>
      }
    >
      {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && courses.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
          No courses set up yet — create one on the Academics page first.
        </p>
      )}

      {!loading && courses.length > 0 && (
        <div className="space-y-3">
          {courses.map((c) => {
            const courseState = state[c.id];
            return (
              <div key={c.id} className="rounded-xl border border-border">
                <label className="flex cursor-pointer items-center gap-2.5 px-3.5 py-3 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={!!courseState?.assigned}
                    onChange={() => toggleCourse(c.id)}
                  />
                  <span className="font-medium text-foreground">
                    {c.name} <span className="text-muted-foreground">({c.code})</span>
                  </span>
                </label>

                {courseState?.assigned && (
                  <div className="border-t border-border px-3.5 py-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      {courseState.subjectIds.size === 0
                        ? "All subjects of this course (default) — check specific ones to restrict."
                        : "Restricted to the checked subjects below."}
                    </p>
                    <CourseSubjectPicker
                      subjects={subjects.filter((s) => s.courses.some((sc) => sc.id === c.id))}
                      selected={courseState.subjectIds}
                      onToggle={(subjectId) => toggleSubject(c.id, subjectId)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function CourseSubjectPicker({
  subjects,
  selected,
  onToggle,
}: {
  subjects: Subject[];
  selected: Set<string>;
  onToggle: (subjectId: string) => void;
}) {
  if (subjects.length === 0) return <p className="text-xs text-muted-foreground">No subjects linked to this course yet.</p>;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {subjects.map((s) => (
        <label
          key={s.id}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            selected.has(s.id) ? "border-primary bg-secondary text-secondary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
          }`}
        >
          <input type="checkbox" className="accent-primary" checked={selected.has(s.id)} onChange={() => onToggle(s.id)} />
          {s.name}
        </label>
      ))}
    </div>
  );
}
