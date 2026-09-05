"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/format";
import type { PortalStudyResource } from "@/lib/types";

const FILE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinejoin="round" />
    <path d="M14 2v6h6" strokeLinejoin="round" />
  </svg>
);

const LINK_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.5-1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The student's own study material (changes-phase12.md §12.5) — everything
 * shared with their course, grouped by subject. Files open the stored URL
 * directly (public course material, same as test papers); links open in a
 * new tab. */
export default function PortalResourcesPage() {
  const [resources, setResources] = useState<PortalStudyResource[] | null>(null);

  useEffect(() => {
    apiFetch<PortalStudyResource[]>("/portal/study-resources")
      .then(setResources)
      .catch(() => setResources([]));
  }, []);

  // Grouped by subject, with course-wide material (no subject) last — it's
  // the general-purpose bucket, so it reads better after the specific ones.
  const groups = new Map<string, { label: string; items: PortalStudyResource[] }>();
  for (const r of resources ?? []) {
    const key = r.subject?.id ?? "__general";
    if (!groups.has(key)) groups.set(key, { label: r.subject?.name ?? "General", items: [] });
    groups.get(key)!.items.push(r);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) =>
    a === "__general" ? 1 : b === "__general" ? -1 : 0
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My learning</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Study material</h1>
        <p className="mt-1 text-sm text-muted-foreground">Notes, PDFs and links shared by your institute.</p>
      </div>

      {resources === null && (
        <div className="space-y-2 rounded-xl border border-border bg-card">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonRow key={i} lines={2} />
          ))}
        </div>
      )}

      {resources && resources.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Nothing shared yet. Material your institute uploads will appear here.
        </p>
      )}

      {ordered.map(([key, group]) => (
        <section key={key} className="space-y-2">
          <h2 className="font-display text-base font-semibold text-foreground">{group.label}</h2>
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {group.items.map((r) => (
              <a
                key={r.id}
                href={r.kind === "FILE" ? r.assetUrl! : r.externalUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-secondary"
              >
                <span className="mt-0.5 shrink-0 text-muted-foreground">
                  {r.kind === "FILE" ? FILE_ICON : LINK_ICON}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{r.title}</span>
                  {r.description && <span className="mt-0.5 block text-xs text-muted-foreground">{r.description}</span>}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {r.kind === "FILE" ? "PDF" : "Link"} · {formatDate(r.createdAt, { year: false })}
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
