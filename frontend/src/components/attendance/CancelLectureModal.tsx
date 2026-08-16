"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { CopyMessageBox } from "@/components/attendance/CopyMessageBox";
import { useMessageTemplate } from "@/lib/useMessageTemplate";
import { lectureCancelledVars, renderTemplate } from "@/lib/messageTemplates";
import { MAX_NOTE_LENGTH, type Lecture } from "@/lib/types";

interface Props {
  lecture: Lecture | null;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelLectureModal({ lecture, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelled, setCancelled] = useState<Lecture | null>(null);

  const template = useMessageTemplate(cancelled ? "LECTURE_CANCELLED" : null);

  useEffect(() => {
    if (!lecture) return;
    setReason("");
    setError(null);
    setCancelled(null);
  }, [lecture]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lecture) return;
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiFetch<Lecture>(`/attendance/lectures/${lecture.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      onCancelled();
      setCancelled(updated);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not cancel this lecture.");
    } finally {
      setSubmitting(false);
    }
  }

  if (cancelled) {
    return (
      <Modal
        open={!!lecture}
        onClose={onClose}
        title="Lecture cancelled"
        description="Let your group know, or close this."
        width="md"
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {cancelled.subject.name} for {cancelled.batch.name} has been cancelled.
          </div>
          {template && <CopyMessageBox message={renderTemplate(template, lectureCancelledVars(cancelled))} />}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={!!lecture}
      onClose={onClose}
      title={lecture ? `Cancel ${lecture.subject.name} — ${lecture.batch.name}` : "Cancel lecture"}
      description="The lecture stays on record as cancelled — attendance can no longer be marked for it."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="destructive" type="submit" form="cancel-lecture-form" disabled={submitting}>
            {submitting ? "Cancelling…" : "Cancel lecture"}
          </Button>
        </>
      }
    >
      <form id="cancel-lecture-form" onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          label="Reason for cancellation"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="e.g. Faculty unavailable, batch rescheduled to next week…"
        />

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
