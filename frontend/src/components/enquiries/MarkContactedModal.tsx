"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { MAX_NOTE_LENGTH, type Enquiry } from "@/lib/types";

interface Props {
  enquiry: Enquiry | null;
  onClose: () => void;
  onSaved: () => void;
}

export function MarkContactedModal({ enquiry, onClose, onSaved }: Props) {
  const [note, setNote] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!enquiry) return;
    setNote("");
    setNextFollowUpDate("");
    setError(null);
  }, [enquiry]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!enquiry) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/enquiries/${enquiry.id}/contacted`, {
        method: "POST",
        body: JSON.stringify({ note: note || undefined, nextFollowUpDate: nextFollowUpDate || undefined }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not log this contact attempt.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={!!enquiry}
      onClose={onClose}
      title={`Mark ${enquiry?.name ?? "lead"} as contacted`}
      description="Logged to this lead's follow-up trail."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="mark-contacted-form" disabled={submitting}>
            {submitting ? "Saving…" : "Mark contacted"}
          </Button>
        </>
      }
    >
      <form id="mark-contacted-form" onSubmit={handleSubmit} className="space-y-4">
        <Textarea
          label="What was discussed (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="e.g. Spoke to the parent, interested in the weekend batch…"
        />

        <Input
          label="Next follow-up (optional)"
          type="date"
          value={nextFollowUpDate}
          onChange={(e) => setNextFollowUpDate(e.target.value)}
        />

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
