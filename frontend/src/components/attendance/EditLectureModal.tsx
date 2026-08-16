"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { MAX_NOTE_LENGTH, type Lecture } from "@/lib/types";

interface Props {
  lecture: Lecture | null;
  onClose: () => void;
  onSaved: () => void;
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function EditLectureModal({ lecture, onClose, onSaved }: Props) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!lecture) return;
    setDate(lecture.date.slice(0, 10));
    setStartTime(lecture.startTime);
    setEndTime(lecture.endTime);
    setNote(lecture.note ?? "");
    setError(null);
  }, [lecture]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lecture) return;
    if (endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/attendance/lectures/${lecture.id}`, {
        method: "PATCH",
        body: JSON.stringify({ date, startTime, endTime, note: note || null }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reschedule this lecture.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={!!lecture}
      onClose={onClose}
      title={lecture ? `Reschedule ${lecture.subject.name} — ${lecture.batch.name}` : "Reschedule lecture"}
      description="Change the date or time — batch, subject and faculty stay the same."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-lecture-form" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="edit-lecture-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Date" type="date" required min={todayInput()} value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Start time" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="End time" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>

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
