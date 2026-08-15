"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ActivityTimeline } from "@/components/enquiries/ActivityTimeline";
import { ENQUIRY_SOURCES, ENQUIRY_SOURCE_LABELS, MAX_NOTE_LENGTH, type Course, type Enquiry } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Enquiry | null;
  courses: Course[];
}

export function EnquiryModal({ open, onClose, onSaved, editing, courses }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [courseId, setCourseId] = useState("");
  const [source, setSource] = useState<string>("OTHER");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setPhone(editing?.phone ?? "");
    setCourseId(editing?.course?.id ?? "");
    setSource(editing?.source ?? "OTHER");
    setNextFollowUpDate(editing?.nextFollowUpDate ? editing.nextFollowUpDate.slice(0, 10) : "");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, editing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      phone,
      courseId: courseId || undefined,
      source,
      nextFollowUpDate: nextFollowUpDate || undefined,
      notes: notes || undefined,
    };

    try {
      if (editing) {
        await apiFetch(`/enquiries/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/enquiries", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save this enquiry.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit enquiry" : "New enquiry"}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="enquiry-form" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Add enquiry"}
          </Button>
        </>
      }
    >
      <form id="enquiry-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>

        <Dropdown
          label="Course interested (optional)"
          value={courseId}
          onChange={setCourseId}
          options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
          placeholder="Select course…"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dropdown
            label="Source"
            value={source}
            onChange={setSource}
            options={ENQUIRY_SOURCES.map((s) => ({ value: s, label: ENQUIRY_SOURCE_LABELS[s] }))}
          />
          <Input
            label="Next follow-up (optional)"
            type="date"
            value={nextFollowUpDate}
            onChange={(e) => setNextFollowUpDate(e.target.value)}
          />
        </div>

        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Anything worth remembering about this lead…"
        />

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>

      {editing && (
        <div className="mt-6 border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium text-foreground">Follow-up history</p>
          <ActivityTimeline enquiryId={editing.id} />
        </div>
      )}
    </Modal>
  );
}
