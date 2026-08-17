"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Dropdown } from "@/components/ui/Dropdown";
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

const CANCELLATION_REASONS = [
  { value: "Faculty unavailable", label: "Faculty unavailable" },
  { value: "Batch rescheduled", label: "Batch rescheduled" },
  { value: "Low attendance expected", label: "Low attendance expected" },
  { value: "Holiday / institute closed", label: "Holiday / institute closed" },
  { value: "Venue unavailable", label: "Venue unavailable" },
  { value: "Other", label: "Other (specify)" },
];

export function CancelLectureModal({ lecture, onClose, onCancelled }: Props) {
  const [reasonOption, setReasonOption] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelled, setCancelled] = useState<Lecture | null>(null);

  const template = useMessageTemplate(cancelled ? "LECTURE_CANCELLED" : null);
  const isOther = reasonOption === "Other";
  const reason = isOther ? customReason.trim() : reasonOption;

  useEffect(() => {
    if (!lecture) return;
    setReasonOption("");
    setCustomReason("");
    setError(null);
    setCancelled(null);
  }, [lecture]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lecture) return;
    if (!reasonOption) {
      setError("Select a reason.");
      return;
    }
    if (isOther && !reason) {
      setError("Enter a reason.");
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
          <Button variant="destructive" type="submit" form="cancel-lecture-form" disabled={submitting || !reasonOption || (isOther && !customReason.trim())}>
            {submitting ? "Cancelling…" : "Cancel lecture"}
          </Button>
        </>
      }
    >
      <form id="cancel-lecture-form" onSubmit={handleSubmit} className="space-y-4">
        <Dropdown
          label="Reason for cancellation"
          value={reasonOption}
          onChange={setReasonOption}
          options={CANCELLATION_REASONS}
          placeholder="Select a reason…"
        />

        {isOther && (
          <Textarea
            label="Specify reason"
            required
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            placeholder="e.g. Faculty unavailable, batch rescheduled to next week…"
          />
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
