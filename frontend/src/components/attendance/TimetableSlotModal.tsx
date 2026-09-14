"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import {
  DAYS_OF_WEEK,
  DAY_OF_WEEK_LABELS,
  type DayOfWeek,
  type Batch,
  type Course,
  type FacultyCourseAssignment,
  type FacultyRef,
  type Room,
  type TimetableSlot,
  type CreateTimetableSlotPayload,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  slotToEdit: TimetableSlot | null;
}

const DURATION_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const totalMinutes = (i + 1) * 30;
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const label = mins === 0 ? `${hrs} hr${hrs > 1 ? "s" : ""}` : `${hrs} hr${hrs > 1 ? "s" : ""} ${mins} mins`;
  return { value: String(totalMinutes), label };
});

function addMinutes(hhmm: string, minutes: number): string {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const total = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getDurationMinutes(start: string, end: string): string {
  if (!start || !end) return "60";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? String(diff) : "60";
}

export function TimetableSlotModal({ open, onClose, onSaved, slotToEdit }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [faculty, setFaculty] = useState<FacultyRef[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assignments, setAssignments] = useState<FacultyCourseAssignment[]>([]);

  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>("MONDAY");
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [endTime, setEndTime] = useState("10:00");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    apiFetch<Course[]>("/academics/courses?active=true").then(setCourses).catch(() => setCourses([]));
    apiFetch<Room[]>("/rooms")
      .then((data) => {
        setRooms(data);
        if (!slotToEdit && data.length === 1) setRoomId(data[0]!.id);
      })
      .catch(() => setRooms([]));
    apiFetch<FacultyRef[]>("/attendance/faculty").then(setFaculty).catch(() => setFaculty([]));

    if (slotToEdit) {
      setDayOfWeek(slotToEdit.dayOfWeek);
      setCourseId(slotToEdit.batch.course.id);
      setBatchId(slotToEdit.batch.id);
      setSubjectId(slotToEdit.subject.id);
      setFacultyId(slotToEdit.faculty.id);
      setRoomId(slotToEdit.room?.id ?? "");
      setStartTime(slotToEdit.startTime);
      const dur = getDurationMinutes(slotToEdit.startTime, slotToEdit.endTime);
      setDuration(dur);
      setEndTime(slotToEdit.endTime);
    } else {
      setDayOfWeek("MONDAY");
      setCourseId("");
      setBatchId("");
      setSubjectId("");
      setFacultyId("");
      setRoomId("");
      setStartTime("09:00");
      setDuration("60");
      setEndTime("10:00");
    }
    setError(null);
  }, [open, slotToEdit]);

  useEffect(() => {
    if (!facultyId) {
      setAssignments([]);
      return;
    }
    apiFetch<FacultyCourseAssignment[]>(`/attendance/faculty/${facultyId}/assignments`)
      .then((data) => {
        setAssignments(data);
        if (!courseId && data.length === 1) setCourseId(data[0]!.course.id);
      })
      .catch(() => setAssignments([]));
  }, [facultyId, courseId]);

  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setBatchId("");
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then((data) => {
        setBatches(data);
        if (slotToEdit && slotToEdit.batch.course.id === courseId) {
          setBatchId(slotToEdit.batch.id);
        } else {
          setBatchId(data.length === 1 ? data[0]!.id : "");
        }
      })
      .catch(() => setBatches([]));
  }, [courseId, slotToEdit]);

  const assignmentForCourse = assignments.find((a) => a.course.id === courseId);
  const [allCourseSubjects, setAllCourseSubjects] = useState<{ id: string; name: string; shortCode: string }[]>([]);

  useEffect(() => {
    if (!courseId) {
      setAllCourseSubjects([]);
      return;
    }
    apiFetch<{ id: string; name: string; shortCode: string; courses: { id: string }[] }[]>("/academics/subjects")
      .then((all) => setAllCourseSubjects(all.filter((s) => s.courses.some((c) => c.id === courseId))))
      .catch(() => setAllCourseSubjects([]));
  }, [courseId]);

  const resolvedSubjects = assignmentForCourse ? assignmentForCourse.subjects : allCourseSubjects;

  useEffect(() => {
    if (slotToEdit && slotToEdit.subject.id && resolvedSubjects.some((s) => s.id === slotToEdit.subject.id)) {
      setSubjectId(slotToEdit.subject.id);
    } else if (resolvedSubjects.length === 1) {
      setSubjectId(resolvedSubjects[0]!.id);
    } else if (!resolvedSubjects.some((s) => s.id === subjectId)) {
      setSubjectId("");
    }
  }, [resolvedSubjects, slotToEdit, subjectId]);

  useEffect(() => {
    setEndTime(startTime ? addMinutes(startTime, Number(duration)) : "");
  }, [startTime, duration]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!batchId || !subjectId || !facultyId || !startTime) {
      setError("Please fill all required fields (Batch, Subject, Faculty, Time).");
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload: CreateTimetableSlotPayload = {
      dayOfWeek,
      startTime,
      endTime,
      batchId,
      subjectId,
      facultyId,
      roomId: roomId || undefined,
    };

    try {
      if (slotToEdit) {
        await apiFetch(`/timetable/${slotToEdit.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/timetable", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save timetable slot.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={slotToEdit ? "Edit Timetable Slot" : "Add Weekly Timetable Slot"}
      description="Define a recurring slot in the weekly schedule. Automatic clash detection is enabled for rooms, faculty, and batches."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="timetable-slot-form" disabled={submitting || !batchId || !subjectId}>
            {submitting ? "Saving…" : slotToEdit ? "Save changes" : "Add slot"}
          </Button>
        </>
      }
    >
      <form id="timetable-slot-form" onSubmit={handleSubmit} className="space-y-4">
        <Dropdown
          label="Day of week"
          value={dayOfWeek}
          onChange={(val) => setDayOfWeek(val as DayOfWeek)}
          options={DAYS_OF_WEEK.map((d) => ({ value: d, label: DAY_OF_WEEK_LABELS[d] }))}
        />

        <Dropdown
          label="Faculty"
          value={facultyId}
          onChange={setFacultyId}
          options={faculty.map((f) => ({ value: f.id, label: f.fullName }))}
          placeholder="Select faculty…"
        />

        <Dropdown
          label="Course"
          value={courseId}
          onChange={setCourseId}
          options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          placeholder="Select course…"
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

        <Dropdown
          label="Classroom / Room (optional)"
          value={roomId}
          onChange={setRoomId}
          options={rooms.map((r) => ({ value: r.id, label: `${r.name}${r.capacity ? ` (${r.capacity} seats)` : ""}` }))}
          placeholder="Select room (optional)…"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Start time" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Dropdown label="Duration" value={duration} onChange={setDuration} options={DURATION_OPTIONS} />
        </div>
        {startTime && endTime && (
          <p className="-mt-2 text-xs text-muted-foreground">Ends at {endTime}</p>
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
