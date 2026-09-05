"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { CopyMessageBox } from "@/components/attendance/CopyMessageBox";
import { CreateMeetingModal } from "@/components/ptm/CreateMeetingModal";
import { formatDate, fmtTime12 } from "@/lib/format";
import type { ParentMeeting } from "@/lib/types";

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
] as const;

/** True while the meeting hasn't finished yet — the window the copy box and
 * Send-now stay available for, per the plan ("the msg to copy until the ptm
 * meeting ends timing"). Combines date + endTime into one instant rather than
 * comparing them separately, since a meeting starting today at 9pm and one
 * ending at 9am both need the same true wall-clock comparison against now. */
function meetingHasEnded(meeting: ParentMeeting): boolean {
  const end = new Date(`${meeting.date.slice(0, 10)}T${meeting.endTime}:00`);
  return Date.now() > end.getTime();
}

function MeetingCard({ meeting, onChanged }: { meeting: ParentMeeting; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ended = meetingHasEnded(meeting);
  const showActions = !meeting.cancelled && !ended;

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && message === null) {
      try {
        const res = await apiFetch<{ body: string }>(`/ptm/${meeting.id}/message`);
        setMessage(res.body);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Could not load the message.");
      }
    }
  }

  async function handleSendNow() {
    setSending(true);
    setSendResult(null);
    try {
      const res = await apiFetch<{ notified: number }>(`/ptm/${meeting.id}/send-now`, { method: "POST" });
      setSendResult(`Sent to ${res.notified} student${res.notified === 1 ? "" : "s"}/parents.`);
    } catch (err) {
      setSendResult(err instanceof ApiClientError ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  }

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    try {
      await apiFetch(`/ptm/${meeting.id}/cancel`, { method: "POST", body: JSON.stringify({ reason: cancelReason.trim() }) });
      setCancelOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not cancel this meeting.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className={`overflow-hidden rounded-xl border bg-card ${meeting.cancelled ? "border-danger/30 opacity-70" : "border-border"}`}>
      <button type="button" onClick={handleExpand} className="flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{meeting.title}</p>
            {meeting.cancelled && <Badge tone="danger">Cancelled</Badge>}
            {!meeting.cancelled && ended && <Badge tone="neutral">Ended</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {meeting.course.name} ({meeting.course.code}) · {meeting.batch.name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDate(meeting.date, { weekday: true })} · {fmtTime12(meeting.startTime)}–{fmtTime12(meeting.endTime)}
            {meeting.venue && ` · ${meeting.venue}`}
          </p>
          {meeting.cancelled && meeting.cancelReason && <p className="mt-1 text-xs text-danger">Cancelled: {meeting.cancelReason}</p>}
        </div>
        {showActions && (
          <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="secondary" onClick={handleSendNow} disabled={sending}>
              {sending ? "Sending…" : "Send now"}
            </Button>
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border p-4">
          {error && <p className="mb-2 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
          {message !== null ? <CopyMessageBox message={message} /> : <p className="text-sm text-muted-foreground">Loading…</p>}
          {sendResult && <p className="mt-2 text-xs text-muted-foreground">{sendResult}</p>}
        </div>
      )}

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this meeting?"
        description="Everyone in this batch — students with a portal login and parents on WhatsApp — is notified that it's cancelled."
        width="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Back
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling || !cancelReason.trim()}>
              {cancelling ? "Cancelling…" : "Cancel meeting"}
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="Shown to students and parents in the cancellation notice."
        />
      </Modal>
    </div>
  );
}

export default function PtmPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("upcoming");
  const [meetings, setMeetings] = useState<ParentMeeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMeetings(await apiFetch<ParentMeeting[]>(`/ptm?scope=${tab}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load meetings.");
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Parent-Teacher Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Scheduled per batch — students and parents are notified automatically.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="shrink-0">
          Schedule a PTM
        </Button>
      </div>

      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {!meetings ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">No {tab} meetings</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {tab === "upcoming" ? "Schedule one to notify students and parents automatically." : "Nothing has happened yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {meetings.map((m) => (
            <MeetingCard key={m.id} meeting={m} onChanged={load} />
          ))}
        </div>
      )}

      <CreateMeetingModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </div>
  );
}
