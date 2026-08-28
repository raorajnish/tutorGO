"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";
import { PushToggle } from "./PushToggle";
import type { AppNotification } from "@/lib/types";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationDrawer({ open, onClose, onUnreadCountChange }: NotificationDrawerProps) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function load() {
    apiFetch<AppNotification[]>("/notifications")
      .then((data) => {
        setItems(data);
        onUnreadCountChange?.(data.filter((n) => !n.read).length);
      })
      .catch(() => {});
  }

  // Polls regardless of whether the drawer is open, so the header badge
  // stays live for an already-open tab — the closest thing to "instant" this
  // app has for recipients who haven't opted into push notifications.
  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  const unreadCount = items.filter((x) => !x.read).length;

  async function markAllRead() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    onUnreadCountChange?.(0);
    await apiFetch("/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  async function markRead(id: string) {
    const next = items.map((x) => (x.id === id ? { ...x, read: true } : x));
    setItems(next);
    onUnreadCountChange?.(next.filter((n) => !n.read).length);
    await apiFetch(`/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }

  if (!mounted) return null;

  return createPortal(
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

        <PushToggle />

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
                !item.read ? "bg-accent/5" : ""
              }`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                {item.title.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">
                  <b className="font-semibold">{item.title}</b>
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{item.body}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
              </span>
              {!item.read && <i className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
            </button>
          ))}
          {items.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>}
        </div>
      </aside>
    </div>,
    document.body
  );
}
