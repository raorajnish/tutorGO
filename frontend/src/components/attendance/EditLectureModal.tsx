"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { MAX_NOTE_LENGTH, type Lecture, type Room } from "@/lib/types";
import { todayInput } from "@/lib/format";

interface Props {
  lecture: Lecture | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditLectureModal({ lecture, onClose, onSaved }: Props) {
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
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

    apiFetch<Room[]>("/rooms")
      .then((data) => {
        setRooms(data);
        if (lecture.room?.id) {
          setRoomId(lecture.room.id);
        } else if (data.length === 1) {
          setRoomId(data[0]!.id);
        } else {
          setRoomId("");
        }
      })
      .catch(() => setRooms([]));
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
        body: JSON.stringify({ date, startTime, endTime, roomId: roomId || null, note: note || null }),
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
      description="Change date, time or classroom — batch, subject and faculty stay the same."
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
        <DatePicker label="Date" required min={todayInput()} value={date} onChange={setDate} />
        <div className="grid grid-cols-2 gap-4">
          <TimePicker label="Start time" required value={startTime} onChange={setStartTime} />
          <TimePicker label="End time" required value={endTime} onChange={setEndTime} />
        </div>

        <Dropdown
          label="Classroom / Room (optional)"
          value={roomId}
          onChange={setRoomId}
          options={rooms.map((r) => ({ value: r.id, label: `${r.name}${r.capacity ? ` (${r.capacity} seats)` : ""}` }))}
          placeholder="Select room (optional)…"
        />

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
