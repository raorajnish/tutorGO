"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { SkeletonRow } from "@/components/ui/Skeleton";
import {
  REMINDER_AUDIENCES,
  REMINDER_AUDIENCE_LABELS,
  REMINDER_CATEGORIES,
  REMINDER_CATEGORY_LABELS,
  REMINDER_LEAD_PRESETS,
  REMINDER_REPEATS,
  REMINDER_REPEAT_LABELS,
  reminderLeadLabel,
  type Reminder,
  type ReminderAudience,
  type ReminderCategory,
  type ReminderRepeat,
  type ReminderStatus,
} from "@/lib/types";
import { formatDate as fmtDate, todayInput } from "@/lib/format";

const STATUS_TONE: Record<ReminderStatus, "success" | "warning" | "danger" | "neutral"> = {
  SCHEDULED: "neutral",
  NOTIFYING: "warning",
  DUE_TODAY: "warning",
  OVERDUE: "danger",
};

const STATUS_LABEL: Record<ReminderStatus, string> = {
  SCHEDULED: "Scheduled",
  NOTIFYING: "Notifying",
  DUE_TODAY: "Due today",
  OVERDUE: "Overdue",
};

/** "Due in 12 days" / "Overdue by 3 days" — the thing you actually scan for. */
function dueSummary(r: Reminder) {
  if (r.daysUntilDue === 0) return "Due today";
  if (r.daysUntilDue === 1) return "Due tomorrow";
  if (r.daysUntilDue < 0) return `Overdue by ${Math.abs(r.daysUntilDue)} day${r.daysUntilDue === -1 ? "" : "s"}`;
  return `Due in ${r.daysUntilDue} days`;
}

export function RemindersTab() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Reminder | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setReminders(await apiFetch<Reminder[]>("/reminders?includeInactive=true"));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load reminders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    await apiFetch(`/reminders/${deleteTarget.id}`, { method: "DELETE" });
    await load();
  }

  async function togglePaused(r: Reminder) {
    setError(null);
    try {
      await apiFetch(`/reminders/${r.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !r.isActive }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this reminder.");
    }
  }

  async function sendNow(r: Reminder) {
    setError(null);
    setNotice(null);
    try {
      const { sentCount } = await apiFetch<{ sentCount: number }>(`/reminders/${r.id}/send-now`, { method: "POST" });
      setNotice(`"${r.title}" sent to ${sentCount} ${sentCount === 1 ? "person" : "people"}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send this reminder.");
    }
  }

  function menuItems(r: Reminder) {
    return [
      { label: "Edit", onClick: () => { setEditing(r); setModalOpen(true); } },
      { label: "Send now", onClick: () => sendNow(r) },
      { label: r.isActive ? "Pause" : "Resume", onClick: () => togglePaused(r) },
      { label: "Delete", tone: "danger" as const, onClick: () => setDeleteTarget(r) },
    ];
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Get notified ahead of bills, rent, renewals and anything else with a date — as many nudges as you want.
          </p>
          <Button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="shrink-0 self-start sm:self-auto"
          >
            New reminder
          </Button>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}
        {notice && <div className="border-b border-border bg-success-soft px-4 py-2 text-sm text-success">{notice}</div>}

        {/* Desktop / tablet: table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Reminder</th>
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Notifies</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 5 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={6}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
              {!loading && reminders.map((r) => (
                <tr key={r.id} className={`border-b border-border last:border-0 ${r.isActive ? "" : "opacity-55"}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {REMINDER_CATEGORY_LABELS[r.category]}
                      {r.repeat !== "NONE" && ` · ${REMINDER_REPEAT_LABELS[r.repeat]}`}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="whitespace-nowrap text-foreground">{fmtDate(r.dueDate)}</p>
                    <p className="text-xs text-muted-foreground">{dueSummary(r)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.leadDays.map((d) => (
                        <Badge key={d} tone={d === r.nextNotifyLead ? "accent" : "neutral"}>
                          {d === 0 ? "On the day" : `${d}d`}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{REMINDER_AUDIENCE_LABELS[r.audience]}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                      {!r.isActive && <Badge tone="neutral">Paused</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <ActionMenu items={menuItems(r)} />
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && reminders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No reminders yet — add one for your next bill or renewal.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards */}
        <div className="divide-y divide-border sm:hidden">
          {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
          {!loading && reminders.map((r) => (
            <div key={r.id} className={`space-y-2 p-4 ${r.isActive ? "" : "opacity-55"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {REMINDER_CATEGORY_LABELS[r.category]}
                    {r.repeat !== "NONE" && ` · ${REMINDER_REPEAT_LABELS[r.repeat]}`}
                  </p>
                </div>
                <ActionMenu items={menuItems(r)} />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                {!r.isActive && <Badge tone="neutral">Paused</Badge>}
              </div>

              <p className="text-sm text-foreground">
                {fmtDate(r.dueDate)} <span className="text-muted-foreground">· {dueSummary(r)}</span>
              </p>

              <div className="flex flex-wrap gap-1">
                {r.leadDays.map((d) => (
                  <Badge key={d} tone={d === r.nextNotifyLead ? "accent" : "neutral"}>
                    {d === 0 ? "On the day" : `${d}d before`}
                  </Badge>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">{REMINDER_AUDIENCE_LABELS[r.audience]}</p>
            </div>
          ))}
          {!loading && reminders.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No reminders yet — add one for your next bill or renewal.
            </p>
          )}
        </div>
      </div>

      <ReminderModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} editing={editing} />

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete reminder"
        description={deleteTarget ? `"${deleteTarget.title}" will be removed. This can't be undone.` : undefined}
      />
    </div>
  );
}

function ReminderModal({
  open,
  onClose,
  onSaved,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editing: Reminder | null;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ReminderCategory>("UTILITY");
  const [dueDate, setDueDate] = useState(todayInput());
  const [leadDays, setLeadDays] = useState<number[]>([7]);
  const [customLead, setCustomLead] = useState("");
  const [repeat, setRepeat] = useState<ReminderRepeat>("NONE");
  const [audience, setAudience] = useState<ReminderAudience>("PRIVATE");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setCategory(editing?.category ?? "UTILITY");
    setDueDate(editing ? editing.dueDate.slice(0, 10) : todayInput());
    setLeadDays(editing?.leadDays ?? [7]);
    setCustomLead("");
    setRepeat(editing?.repeat ?? "NONE");
    setAudience(editing?.audience ?? "PRIVATE");
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, editing]);

  function toggleLead(days: number) {
    setLeadDays((prev) => (prev.includes(days) ? prev.filter((d) => d !== days) : [...prev, days]));
  }

  function addCustomLead() {
    const n = Number(customLead);
    if (!Number.isInteger(n) || n < 0 || n > 730) return;
    setLeadDays((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setCustomLead("");
  }

  const sortedLeads = [...leadDays].sort((a, b) => b - a);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (leadDays.length === 0) {
      setError("Pick at least one time to be reminded.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload = { title, category, dueDate, leadDays: sortedLeads, repeat, audience, notes: notes || undefined };

    try {
      if (editing) {
        await apiFetch(`/reminders/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/reminders", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save this reminder.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.title}` : "New reminder"}
      description="You'll get an in-app notification at each time you pick before the due date."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="reminder-form" disabled={submitting}>
            {submitting ? "Saving…" : editing ? "Save changes" : "Create reminder"}
          </Button>
        </>
      }
    >
      <form id="reminder-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="What's it for?"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Electricity bill"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dropdown
            label="Category"
            value={category}
            onChange={(v) => setCategory(v as ReminderCategory)}
            options={REMINDER_CATEGORIES.map((c) => ({ value: c, label: REMINDER_CATEGORY_LABELS[c] }))}
          />
          <Input label="Due date" type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">Remind me</p>
          <div className="flex flex-wrap gap-2">
            {REMINDER_LEAD_PRESETS.map((d) => {
              const on = leadDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleLead(d)}
                  aria-pressed={on}
                  className={`min-h-11 rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {reminderLeadLabel(d)}
                </button>
              );
            })}
            {/* Any lead time already saved that isn't one of the presets. */}
            {sortedLeads
              .filter((d) => !REMINDER_LEAD_PRESETS.includes(d as (typeof REMINDER_LEAD_PRESETS)[number]))
              .map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleLead(d)}
                  aria-pressed
                  className="min-h-11 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
                >
                  {reminderLeadLabel(d)}
                </button>
              ))}
          </div>

          <div className="mt-2 flex items-end gap-2">
            <Input
              label="Or another number of days"
              type="number"
              min={0}
              max={730}
              value={customLead}
              onChange={(e) => setCustomLead(e.target.value)}
              placeholder="e.g. 45"
            />
            <Button variant="secondary" onClick={addCustomLead} disabled={customLead === ""} className="mb-0.5 shrink-0">
              Add
            </Button>
          </div>

          {leadDays.length === 0 && <p className="mt-2 text-xs text-danger">Pick at least one.</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dropdown
            label="Repeats"
            value={repeat}
            onChange={(v) => setRepeat(v as ReminderRepeat)}
            options={REMINDER_REPEATS.map((r) => ({ value: r, label: REMINDER_REPEAT_LABELS[r] }))}
          />
          <Dropdown
            label="Who gets notified"
            value={audience}
            onChange={(v) => setAudience(v as ReminderAudience)}
            options={REMINDER_AUDIENCES.map((a) => ({ value: a, label: REMINDER_AUDIENCE_LABELS[a] }))}
          />
        </div>

        <Textarea
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Account number, who to call, amount…"
        />

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
