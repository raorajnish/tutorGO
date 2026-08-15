"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { ENQUIRY_ACTIVITY_LABELS, type EnquiryActivity } from "@/lib/types";

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const DOT_TONE: Record<EnquiryActivity["type"], string> = {
  CONTACTED: "bg-accent",
  CONVERTED: "bg-success",
  LOST: "bg-danger",
};

export function ActivityTimeline({ enquiryId }: { enquiryId: string }) {
  const [activities, setActivities] = useState<EnquiryActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch<EnquiryActivity[]>(`/enquiries/${enquiryId}/activities`)
      .then((data) => {
        if (!cancelled) setActivities(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : "Could not load history.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enquiryId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading history…</p>;
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (activities.length === 0) return <p className="text-sm text-muted-foreground">No follow-up activity yet.</p>;

  return (
    <div className="space-y-4">
      {activities.map((a, i) => (
        <div key={a.id} className="relative flex gap-3 pl-1">
          <div className="flex flex-col items-center">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT_TONE[a.type]}`} />
            {i < activities.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-sm font-medium text-foreground">{ENQUIRY_ACTIVITY_LABELS[a.type]}</p>
              <p className="text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</p>
            </div>
            {a.createdByName && <p className="text-xs text-muted-foreground">by {a.createdByName}</p>}
            {a.note && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{a.note}</p>}
            {a.nextFollowUpDate && (
              <p className="mt-1 text-xs text-muted-foreground">Next follow-up: {fmtDate(a.nextFollowUpDate)}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
