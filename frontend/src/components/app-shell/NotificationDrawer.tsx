"use client";

import { useEffect, useState } from "react";

interface NotificationItem {
  id: string;
  person: string;
  action: string;
  detail?: string;
  time: string;
  unread: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "1",
    person: "Nina Fischer",
    action: "enrolled a new student in",
    detail: "Grade 10 — Physics",
    time: "12 minutes ago",
    unread: true,
  },
  {
    id: "2",
    person: "Kaito Yamada",
    action: "marked attendance for",
    detail: "Batch B — Morning",
    time: "38 minutes ago",
    unread: true,
  },
  {
    id: "3",
    person: "Mila Grey",
    action: "submitted a fee payment",
    time: "2 hours ago",
    unread: true,
  },
  {
    id: "4",
    person: "TutorGO system",
    action: "generated the weekly performance report",
    time: "Yesterday",
    unread: false,
  },
  {
    id: "5",
    person: "Owen Castillo",
    action: "requested access to",
    detail: "Riverside Institute",
    time: "2 days ago",
    unread: false,
  },
];

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ open, onClose }: NotificationDrawerProps) {
  const [items, setItems] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const unreadCount = items.filter((x) => x.unread).length;

  function markAllRead() {
    setItems((prev) => prev.map((x) => ({ ...x, unread: false })));
  }

  function markRead(id: string) {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, unread: false } : x)));
  }

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      {/* Backdrop */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close notifications"
        tabIndex={open ? 0 : -1}
        className={`absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className={`absolute inset-y-0 right-0 flex h-full w-full max-w-sm flex-col bg-card shadow-(--shadow-overlay) transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Activity</p>
            <h2 className="font-display text-lg font-semibold text-foreground">Notifications</h2>
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

        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <span className="text-sm text-muted-foreground">
            {unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
          </span>
          <button
            type="button"
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="text-sm font-medium text-accent transition-colors duration-150 hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Mark all read
          </button>
        </div>

        <div className="flex-1 divide-y divide-border overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => markRead(item.id)}
              className={`flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-secondary ${
                item.unread ? "bg-accent/5" : ""
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {item.person.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">
                  <b className="font-semibold">{item.person}</b> {item.action}
                  {item.detail && <> &ldquo;{item.detail}&rdquo;</>}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.time}</span>
              </span>
              {item.unread && <i className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
