"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import type { Batch } from "@/lib/types";

interface Props {
  batch: Batch | null;
  onClose: () => void;
}

export function BatchAnnouncementModal({ batch, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ notified: number; batchName: string } | null>(null);

  useEffect(() => {
    if (!batch) return;
    setTitle("");
    setMessage("");
    setError(null);
    setResult(null);
  }, [batch]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!batch) return;
    if (!title.trim() || !message.trim()) {
      setError("Please enter both a title and announcement message.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiFetch<{ success: boolean; notified: number; batchName: string }>("/announcements/batch", {
        method: "POST",
        body: JSON.stringify({
          batchId: batch.id,
          title: title.trim(),
          message: message.trim(),
        }),
      });
      setResult({ notified: res.notified, batchName: res.batchName });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send broadcast announcement.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setResult(null);
    onClose();
  }

  return (
    <Modal
      open={!!batch}
      onClose={handleClose}
      title={batch ? `Broadcast Announcement — ${batch.name}` : "Broadcast Announcement"}
      description="Send a live announcement to all active students in this batch. Notifications appear on student portal logins (In-app + Web Push) and via WhatsApp if configured."
      width="md"
      footer={
        result ? (
          <Button onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" form="batch-announcement-form" disabled={submitting}>
              {submitting ? "Sending broadcast…" : "Send announcement"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3 rounded-xl border border-success/30 bg-success-soft p-4 text-sm text-success">
          <p className="font-semibold">Announcement broadcasted successfully!</p>
          <p className="text-xs text-success/90">
            Delivered to <strong>{result.notified}</strong> student(s) in batch <strong>{result.batchName}</strong>.
          </p>
        </div>
      ) : (
        <form id="batch-announcement-form" onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Announcement Title"
            required
            placeholder="e.g. Special Revision Class Tomorrow / Class Time Change"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
          />
          <Textarea
            label="Announcement Message"
            required
            placeholder="Write the full announcement details for students and parents..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={4}
          />

          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
