"use client";

import { useEffect, useState, use as usePromise, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportTicketDetail,
  type SupportTicketStatus,
} from "@/lib/types";
import { formatDate } from "@/lib/format";

const STATUSES: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

function statusTone(status: SupportTicketStatus): "primary" | "warning" | "success" {
  if (status === "OPEN") return "primary";
  if (status === "IN_PROGRESS") return "warning";
  return "success";
}

export default function PlatformSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  function load() {
    apiFetch<SupportTicketDetail>(`/platform/support/tickets/${id}`)
      .then(setTicket)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this ticket."));
  }

  useEffect(load, [id]);

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const updated = await apiFetch<SupportTicketDetail>(`/platform/support/tickets/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: reply }),
      });
      setTicket(updated);
      setReply("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send this reply.");
    } finally {
      setSending(false);
    }
  }

  async function handleStatusChange(next: string) {
    setChangingStatus(true);
    setError(null);
    try {
      const updated = await apiFetch<SupportTicketDetail>(`/platform/support/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setTicket((prev) => (prev ? { ...prev, status: updated.status } : prev));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update status.");
    } finally {
      setChangingStatus(false);
    }
  }

  if (!ticket) {
    return error ? (
      <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>
    ) : (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/platform/support" className="text-sm text-muted-foreground hover:text-foreground">
          ← All tickets
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">{ticket.subject}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {ticket.createdBy.fullName} ({ticket.createdBy.email}) · {ticket.organization?.name}
              {ticket.institute && ` · ${ticket.institute.name}`}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={statusTone(ticket.status)}>{SUPPORT_STATUS_LABELS[ticket.status]}</Badge>
              <span className="text-xs text-muted-foreground">{SUPPORT_CATEGORY_LABELS[ticket.category]}</span>
            </div>
          </div>
          <div className="w-40">
            <Dropdown
              value={ticket.status}
              onChange={handleStatusChange}
              disabled={changingStatus}
              options={STATUSES.map((s) => ({ value: s, label: SUPPORT_STATUS_LABELS[s] }))}
            />
          </div>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        {ticket.messages.map((m) => (
          <div key={m.id} className={`flex ${m.isFromPlatform ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${
                m.isFromPlatform ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
              }`}
            >
              <p className="mb-1 text-xs font-semibold opacity-70">{m.isFromPlatform ? "You (Support)" : m.author.fullName}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-right text-[11px] opacity-60">{formatDate(m.createdAt, { year: false })}</p>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <form onSubmit={handleReply} className="space-y-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          maxLength={5000}
          placeholder="Reply to this ticket…"
          className="w-full resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={sending || !reply.trim()}>
            {sending ? "Sending…" : "Send reply"}
          </Button>
        </div>
      </form>
    </div>
  );
}
