"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { ICONS, IconChip, StaggerItem, StaggerList, PortalEmpty, PortalHeader } from "@/components/portal/PortalPieces";
import { formatDateTime } from "@/lib/format";
import type { PortalNotifications } from "@/lib/types";

/** Icon per reminder type — the same five triggers the institute configures
 * message templates for, so a student can tell a fee alert from a test result
 * before reading a word. */
const TYPE_ICON: Record<string, React.ReactNode> = {
  FEE_OVERDUE_REMINDER: ICONS.rupee,
  TEST_RESULT_ENTERED: ICONS.medal,
  LECTURE_SCHEDULED: ICONS.book,
  LECTURE_CANCELLED: ICONS.clock,
  ATTENDANCE_MARKED: ICONS.check,
};

export default function PortalNotificationsPage() {
  const [data, setData] = useState<PortalNotifications | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<PortalNotifications>("/portal/notifications"));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load your updates.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markAllRead() {
    setMarking(true);
    try {
      await apiFetch("/portal/notifications/read", { method: "POST", body: JSON.stringify({}) });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not mark these as read.");
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PortalHeader
          eyebrow="My learning"
          title="Updates"
          subtitle="Fee reminders, test results and timetable changes."
        />
        {data && data.unread > 0 && (
          <Button variant="secondary" onClick={markAllRead} disabled={marking} className="shrink-0">
            {marking ? "Marking…" : `Mark all read (${data.unread})`}
          </Button>
        )}
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {!data ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonBlock key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : data.notifications.length === 0 ? (
        <PortalEmpty
          title="Nothing yet"
          hint="Fee reminders, new results and schedule changes will show up here."
        />
      ) : (
        <StaggerList>
          {data.notifications.map((n) => {
            const unread = n.readAt === null;
            return (
              <StaggerItem
                key={n.id}
                className={`flex gap-3 rounded-xl border bg-card p-4 shadow-(--shadow-card) ${
                  unread ? "border-accent/40" : "border-border"
                }`}
              >
                <IconChip>{TYPE_ICON[n.type] ?? ICONS.bell}</IconChip>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    {unread && <Badge tone="accent">New</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{n.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerList>
      )}
    </div>
  );
}
