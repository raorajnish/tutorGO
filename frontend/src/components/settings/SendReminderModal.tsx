"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { TEAM_ROLES, TEAM_ROLE_LABELS, type ReminderAudienceRow, type TeamRole } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SendReminderModal({ open, onClose }: Props) {
  const [audience, setAudience] = useState<ReminderAudienceRow[]>([]);
  const [selected, setSelected] = useState<Set<TeamRole>>(new Set());
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setSelected(new Set());
    setError(null);
    setSentCount(null);
    apiFetch<ReminderAudienceRow[]>("/org/reminders/audience").then(setAudience).catch(() => {});
  }, [open]);

  const allSelected = selected.size === TEAM_ROLES.length;
  const totalRecipients = audience
    .filter((a) => allSelected || selected.has(a.role))
    .reduce((sum, a) => sum + a.count, 0);

  function toggleRole(role: TeamRole) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(TEAM_ROLES));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return setError("Enter a title and message.");
    if (selected.size === 0) return setError("Pick who this announcement goes to.");

    setError(null);
    setSending(true);
    try {
      const res = await apiFetch<{ sentCount: number }>("/org/reminders", {
        method: "POST",
        body: JSON.stringify({ title, body, roles: [...selected] }),
      });
      setSentCount(res.sentCount);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send this announcement.");
    } finally {
      setSending(false);
    }
  }

  if (sentCount !== null) {
    return (
      <Modal open={open} onClose={onClose} title="Announcement sent" width="sm" footer={<Button onClick={onClose}>Done</Button>}>
        <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success">
          Sent to {sentCount} {sentCount === 1 ? "person" : "people"}.
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send announcement"
      description="An in-app notification to everyone, or specific roles."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" form="send-reminder-form" disabled={sending}>
            {sending ? "Sending…" : `Send${totalRecipients > 0 ? ` to ${totalRecipients}` : ""}`}
          </Button>
        </>
      }
    >
      <form id="send-reminder-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Send to</p>
            <button type="button" onClick={toggleAll} className="text-sm font-medium text-accent hover:opacity-80">
              {allSelected ? "Clear all" : "All"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TEAM_ROLES.map((role) => {
              const count = audience.find((a) => a.role === role)?.count ?? 0;
              const active = selected.has(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    active ? "border-primary bg-secondary text-secondary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <p className="font-medium">{TEAM_ROLE_LABELS[role]}</p>
                  <p className="text-xs opacity-80">{count} {count === 1 ? "person" : "people"}</p>
                </button>
              );
            })}
          </div>
        </div>

        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Staff meeting tomorrow" />
        <Textarea
          label="Message"
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          placeholder="e.g. All-staff meeting at 5pm in the main hall."
        />

        {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
