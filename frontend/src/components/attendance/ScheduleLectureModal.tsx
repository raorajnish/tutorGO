"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { CopyMessageBox } from "@/components/attendance/CopyMessageBox";
import { useMessageTemplate } from "@/lib/useMessageTemplate";
import { lectureScheduledVars, renderTemplate } from "@/lib/messageTemplates";
import { MAX_NOTE_LENGTH, type Batch, type Course, type FacultyCourseAssignment, type FacultyRef, type Lecture, type ScheduleLecturePayload } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
  defaultDate: string;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 1 hr through 12 hrs, in 30-minute steps.
const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const totalMinutes = (i + 1) * 30;
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const label = mins === 0 ? `${hrs} hr${hrs > 1 ? "s" : ""}` : `${hrs} hr${hrs > 1 ? "s" : ""} ${mins} mins`;
  return { value: String(totalMinutes), label };
});

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function ScheduleLectureModal({ open, onClose, onScheduled, defaultDate }: Props) {
  const { user } = useAuth();
  const isFaculty = user?.role === "FACULTY";

  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [faculty, setFaculty] = useState<FacultyRef[]>([]);
  const [assignments, setAssignments] = useState<FacultyCourseAssignment[]>([]);

  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("120");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scheduled, setScheduled] = useState<Lecture | null>(null);

  const template = useMessageTemplate(scheduled ? "LECTURE_SCHEDULED" : null);

  // Reset + initial loads on open.
  useEffect(() => {
    if (!open) return;
    setCourseId("");
    setBatchId("");
    setSubjectId("");
    setFacultyId(isFaculty ? (user?.id ?? "") : "");
    setAssignments([]);
    setDate(defaultDate);
    setStartTime("");
    setDuration("120");
    setEndTime("");
    setNote("");
    setError(null);
    setScheduled(null);

    apiFetch<Course[]>("/academics/courses").then(setCourses);
    if (!isFaculty) apiFetch<FacultyRef[]>("/attendance/faculty").then(setFaculty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, isFaculty]);

  // Faculty selected (self, or picked by staff) → fetch their assignments, and
  // if they teach exactly one course, auto-fill it as a convenience default.
  useEffect(() => {
    if (!facultyId) {
      setAssignments([]);
      return;
    }
    apiFetch<FacultyCourseAssignment[]>(`/attendance/faculty/${facultyId}/assignments`)
      .then((data) => {
        setAssignments(data);
        if (isFaculty || !courseId) {
          if (data.length === 1) setCourseId(data[0]!.course.id);
          else if (isFaculty) setCourseId("");
        }
      })
      .catch(() => setAssignments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyId]);

  // Course-first path (staff only, no faculty picked yet): narrow the faculty
  // dropdown to whoever is assigned to teach this course.
  useEffect(() => {
    if (isFaculty || facultyId || !courseId) return;
    apiFetch<FacultyRef[]>(`/attendance/faculty?courseId=${courseId}`)
      .then(setFaculty)
      .catch(() => {});
  }, [courseId, facultyId, isFaculty]);

  // Course resolved → fetch its batches, auto-fill if there's only one.
  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setBatchId("");
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then((data) => {
        setBatches(data);
        setBatchId(data.length === 1 ? data[0]!.id : "");
      })
      .catch(() => setBatches([]));
  }, [courseId]);

  const courseOptions = isFaculty ? assignments.map((a) => a.course) : courses;

  const assignmentForCourse = assignments.find((a) => a.course.id === courseId);

  const [allCourseSubjects, setAllCourseSubjects] = useState<{ id: string; name: string; shortCode: string }[]>([]);
  useEffect(() => {
    if (!courseId || assignmentForCourse) {
      if (!assignmentForCourse) setAllCourseSubjects([]);
      return;
    }
    apiFetch<{ id: string; name: string; shortCode: string; courses: { id: string }[] }[]>("/academics/subjects")
      .then((all) => setAllCourseSubjects(all.filter((s) => s.courses.some((c) => c.id === courseId))))
      .catch(() => setAllCourseSubjects([]));
  }, [courseId, assignmentForCourse]);

  const resolvedSubjects = assignmentForCourse ? assignmentForCourse.subjects : allCourseSubjects;

  // Auto-fill subject when the resolved list narrows to exactly one.
  useEffect(() => {
    if (resolvedSubjects.length === 1) setSubjectId(resolvedSubjects[0]!.id);
    else if (!resolvedSubjects.some((s) => s.id === subjectId)) setSubjectId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSubjects]);

  // End time is always derived from start time + duration, never typed directly.
  useEffect(() => {
    setEndTime(startTime ? addMinutes(startTime, Number(duration)) : "");
  }, [startTime, duration]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!batchId || !subjectId) {
      setError("Select a course, batch and subject.");
      return;
    }
    if (!isFaculty && !facultyId) {
      setError("Select the faculty for this lecture.");
      return;
    }
    if (!startTime) {
      setError("Select a start time.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload: ScheduleLecturePayload = {
      batchId,
      subjectId,
      date,
      startTime,
      endTime,
      facultyId: isFaculty ? undefined : facultyId,
      note: note || undefined,
    };

    try {
      const created = await apiFetch<Lecture>("/attendance/lectures", { method: "POST", body: JSON.stringify(payload) });
      onScheduled();
      setScheduled(created);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not schedule this lecture.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setScheduled(null);
    onClose();
  }

  if (scheduled) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Lecture scheduled"
        description="Share the details with your group, or close this."
        width="md"
        footer={<Button onClick={handleClose}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success">
            {scheduled.subject.name} for {scheduled.batch.name} is on the schedule.
          </div>
          {template && <CopyMessageBox message={renderTemplate(template, lectureScheduledVars(scheduled))} />}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Schedule lecture"
      description={
        isFaculty
          ? "You'll be set as the faculty for this lecture."
          : "Pick a faculty and their course/subject prefill, or start from the course instead."
      }
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-lecture-form" disabled={submitting}>
            {submitting ? "Scheduling…" : "Schedule lecture"}
          </Button>
        </>
      }
    >
      <form id="schedule-lecture-form" onSubmit={handleSubmit} className="space-y-4">
        {!isFaculty && (
          <Dropdown
            label="Faculty"
            value={facultyId}
            onChange={setFacultyId}
            options={faculty.map((f) => ({ value: f.id, label: f.fullName }))}
            placeholder="Select faculty…"
          />
        )}

        <Dropdown
          label="Course"
          value={courseId}
          onChange={setCourseId}
          options={courseOptions.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          placeholder={isFaculty && courseOptions.length === 0 ? "No courses assigned to you yet" : "Select course…"}
          disabled={isFaculty && courseOptions.length === 0}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dropdown
            label="Batch"
            value={batchId}
            onChange={setBatchId}
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
            placeholder={courseId ? "Select batch…" : "Select a course first"}
            disabled={!courseId}
          />
          <Dropdown
            label="Subject"
            value={subjectId}
            onChange={setSubjectId}
            options={resolvedSubjects.map((s) => ({ value: s.id, label: `${s.name} (${s.shortCode})` }))}
            placeholder={courseId ? "Select subject…" : "Select a course first"}
            disabled={!courseId}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Date" type="date" required min={todayInput()} value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Start time" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Dropdown label="Duration" value={duration} onChange={setDuration} options={DURATION_OPTIONS} />
        </div>
        {startTime && endTime && (
          <p className="-mt-2 text-xs text-muted-foreground">Ends at {endTime}</p>
        )}

        <Textarea
          label="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="e.g. Bring calculators, extra doubt-clearing session…"
        />

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
