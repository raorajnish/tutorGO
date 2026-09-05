"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import type { Batch, Course, CreateParentMeetingBatch } from "@/lib/types";

/**
 * Schedules a PTM for one or more batches at once — how "12th standard's
 * PTM" gets scheduled: pick the course, tick every batch, give each its own
 * time. The backend writes one independent ParentMeeting row per batch
 * selected, so any one can be rescheduled or cancelled afterward without
 * touching the others.
 */
export function CreateMeetingModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [sharedDate, setSharedDate] = useState("");
  const [sharedStart, setSharedStart] = useState("");
  const [sharedEnd, setSharedEnd] = useState("");
  const [venue, setVenue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setCourseId("");
    setBatches([]);
    setSelectedBatchIds([]);
    setSharedDate("");
    setSharedStart("");
    setSharedEnd("");
    setVenue("");
    setNote("");
    setError(null);
    apiFetch<Course[]>("/academics/courses?active=true").then(setCourses).catch(() => setCourses([]));
  }, [open]);

  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setSelectedBatchIds([]);
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`).then(setBatches).catch(() => setBatches([]));
    setSelectedBatchIds([]);
  }, [courseId]);

  function toggleBatch(id: string) {
    setSelectedBatchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    if (!title.trim() || !courseId || selectedBatchIds.length === 0 || !sharedDate || !sharedStart || !sharedEnd) return;
    setError(null);
    setSubmitting(true);
    try {
      const meetings: CreateParentMeetingBatch[] = selectedBatchIds.map((batchId) => ({
        batchId,
        date: sharedDate,
        startTime: sharedStart,
        endTime: sharedEnd,
        venue: venue.trim() || undefined,
        note: note.trim() || undefined,
      }));
      await apiFetch("/ptm", { method: "POST", body: JSON.stringify({ title: title.trim(), courseId, meetings }) });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not schedule this meeting.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule a PTM"
      description="Every selected batch gets the same time slot by default — reschedule any one afterward without touching the rest."
      width="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !courseId || selectedBatchIds.length === 0 || !sharedDate || !sharedStart || !sharedEnd}
          >
            {submitting ? "Scheduling…" : `Schedule for ${selectedBatchIds.length || 0} batch${selectedBatchIds.length === 1 ? "" : "es"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Title" placeholder="e.g. Term 1 Parent-Teacher Meeting" value={title} onChange={(e) => setTitle(e.target.value)} />

        <Dropdown
          label="Course / standard"
          value={courseId}
          onChange={setCourseId}
          options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          placeholder="Select a course"
        />

        {courseId && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Batches</p>
            {batches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No batches in this course.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {batches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBatch(b.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      selectedBatchIds.includes(b.id)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Date" type="date" value={sharedDate} onChange={(e) => setSharedDate(e.target.value)} />
          <Input label="Start time" type="time" value={sharedStart} onChange={(e) => setSharedStart(e.target.value)} />
          <Input label="End time" type="time" value={sharedEnd} onChange={(e) => setSharedEnd(e.target.value)} />
        </div>

        <Input label="Venue (optional)" placeholder="e.g. Room 204, or a video call link" value={venue} onChange={(e) => setVenue(e.target.value)} />

        {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
