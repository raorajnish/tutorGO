"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportTicketCategory,
  type SupportTicketDetail,
  type SupportTicketStatus,
  type SupportTicketSummary,
} from "@/lib/types";
import { formatDate } from "@/lib/format";

function statusTone(status: SupportTicketStatus): "primary" | "warning" | "success" {
  if (status === "OPEN") return "primary";
  if (status === "IN_PROGRESS") return "warning";
  return "success";
}

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

type View = { mode: "list" } | { mode: "new" } | { mode: "thread"; id: string };

/** Staff-side Help & support drawer — mirrors NotificationDrawer's visual
 * language (a right-side panel over a backdrop) but holds three views
 * instead of one: the ticket list, a new-ticket form, and a thread. See
 * changes-phase12.md §12.3. */
export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<View>({ mode: "list" });
  const [tickets, setTickets] = useState<SupportTicketSummary[] | null>(null);

  useEffect(() => setMounted(true), []);

  function loadList() {
    apiFetch<SupportTicketSummary[]>("/support/tickets")
      .then(setTickets)
      .catch(() => setTickets([]));
  }

  useEffect(() => {
    if (!open) return;
    setView({ mode: "list" });
    loadList();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close help"
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Help & support"
        className={`absolute inset-y-0 right-0 flex h-full w-full max-w-sm flex-col bg-card shadow-(--shadow-overlay) transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Support</p>
            <h2 className="font-display text-lg font-semibold text-foreground">Help & support</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {view.mode === "list" && (
          <TicketList
            tickets={tickets}
            onOpen={(id) => setView({ mode: "thread", id })}
            onNew={() => setView({ mode: "new" })}
          />
        )}
        {view.mode === "new" && (
          <NewTicketForm
            onCancel={() => setView({ mode: "list" })}
            onCreated={(id) => {
              loadList();
              setView({ mode: "thread", id });
            }}
          />
        )}
        {view.mode === "thread" && (
          <ThreadView
            ticketId={view.id}
            onBack={() => {
              loadList();
              setView({ mode: "list" });
            }}
          />
        )}
      </aside>
    </div>,
    document.body
  );
}

function TicketList({
  tickets,
  onOpen,
  onNew,
}: {
  tickets: SupportTicketSummary[] | null;
  onOpen: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <span className="text-sm text-muted-foreground">
          {tickets === null ? "Loading…" : tickets.length === 0 ? "No tickets yet" : `${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`}
        </span>
        <Button onClick={onNew} className="px-3 py-1.5 text-xs">
          New ticket
        </Button>
      </div>
      <div className="flex-1 divide-y divide-border overflow-y-auto">
        {tickets?.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onOpen(t.id)}
            className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-secondary"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <b className="truncate text-sm font-semibold text-foreground">{t.subject}</b>
              </span>
              <span className="mt-1 flex items-center gap-2">
                <Badge tone={statusTone(t.status)}>{SUPPORT_STATUS_LABELS[t.status]}</Badge>
                <span className="text-xs text-muted-foreground">{SUPPORT_CATEGORY_LABELS[t.category]}</span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {t._count.messages} message{t._count.messages === 1 ? "" : "s"} · {formatDate(t.updatedAt, { year: false })}
              </span>
            </span>
          </button>
        ))}
        {tickets && tickets.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No support tickets yet. Something not working, or a question about billing? Start one above.
          </p>
        )}
      </div>
    </>
  );
}

function NewTicketForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const [category, setCategory] = useState<SupportTicketCategory>("OTHER");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await apiFetch<SupportTicketSummary>("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ category, subject, body }),
      });
      onCreated(ticket.id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create this ticket.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
      <button type="button" onClick={onCancel} className="-mt-1 flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      <Dropdown
        label="Category"
        value={category}
        onChange={(v) => setCategory(v as SupportTicketCategory)}
        options={SUPPORT_CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABELS[c] }))}
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Subject</label>
        <input
          required
          maxLength={200}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="One line describing the issue"
        />
      </div>

      <div className="flex flex-1 flex-col">
        <label className="mb-1.5 block text-sm font-medium text-foreground">Message</label>
        <textarea
          required
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="w-full flex-1 resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="What's going on? Include steps to reproduce if it's a bug."
        />
      </div>

      {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Sending…" : "Send to support"}
      </Button>
    </form>
  );
}

function ThreadView({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function load() {
    apiFetch<SupportTicketDetail>(`/support/tickets/${ticketId}`)
      .then(setTicket)
      .catch(() => setError("Could not load this ticket."));
  }

  useEffect(load, [ticketId]);

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const updated = await apiFetch<SupportTicketDetail>(`/support/tickets/${ticketId}/messages`, {
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

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All tickets
        </button>
        {ticket && (
          <div className="mt-2">
            <p className="text-sm font-semibold text-foreground">{ticket.subject}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={statusTone(ticket.status)}>{SUPPORT_STATUS_LABELS[ticket.status]}</Badge>
              <span className="text-xs text-muted-foreground">{SUPPORT_CATEGORY_LABELS[ticket.category]}</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {ticket?.messages.map((m) => (
          <div key={m.id} className={`flex ${m.isFromPlatform ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                m.isFromPlatform ? "bg-secondary text-secondary-foreground" : "bg-accent text-accent-foreground"
              }`}
            >
              <p className="mb-1 text-xs font-semibold opacity-70">{m.isFromPlatform ? "Support" : "You"}</p>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 text-right text-[11px] opacity-60">{formatDate(m.createdAt, { year: false })}</p>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="mx-5 mb-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      <form onSubmit={handleReply} className="flex items-end gap-2 border-t border-border px-5 py-3">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          maxLength={5000}
          placeholder="Reply…"
          className="flex-1 resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" disabled={sending || !reply.trim()} className="px-3 py-2.5 text-xs">
          {sending ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
