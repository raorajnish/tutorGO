"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { SkeletonRow } from "@/components/ui/Skeleton";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  type SupportTicketStatus,
  type SupportTicketSummary,
} from "@/lib/types";
import { formatDate } from "@/lib/format";

const STATUSES: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED"];

function statusTone(status: SupportTicketStatus): "primary" | "warning" | "success" {
  if (status === "OPEN") return "primary";
  if (status === "IN_PROGRESS") return "warning";
  return "success";
}

export default function PlatformSupportPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<SupportTicketSummary[] | null>(null);
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      if (category) qs.set("category", category);
      setTickets(await apiFetch<SupportTicketSummary[]>(`/platform/support/tickets?${qs.toString()}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load support tickets.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, category]);

  const openCount = tickets?.filter((t) => t.status !== "RESOLVED").length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Support</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tickets === null ? "Loading…" : `${openCount} ticket${openCount === 1 ? "" : "s"} awaiting a reply, across every organization.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="min-w-[160px]">
          <Dropdown
            label="Status"
            value={status}
            onChange={setStatus}
            options={[{ value: "", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: SUPPORT_STATUS_LABELS[s] }))]}
          />
        </div>
        <div className="min-w-[180px]">
          <Dropdown
            label="Category"
            value={category}
            onChange={setCategory}
            options={[
              { value: "", label: "All categories" },
              ...SUPPORT_CATEGORIES.map((c) => ({ value: c, label: SUPPORT_CATEGORY_LABELS[c] })),
            ]}
          />
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Subject</th>
              <th className="px-4 py-2.5">From</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tickets === null &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={5}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
            {tickets?.map((t) => (
              <tr
                key={t.id}
                onClick={() => router.push(`/platform/support/${t.id}`)}
                className="cursor-pointer transition-colors hover:bg-secondary"
              >
                <td className="px-4 py-3 font-medium text-foreground">{t.subject}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.createdBy.fullName}
                  <span className="block text-xs">{t.organization?.name}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{SUPPORT_CATEGORY_LABELS[t.category]}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone(t.status)}>{SUPPORT_STATUS_LABELS[t.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(t.updatedAt, { year: false })}</td>
              </tr>
            ))}
            {tickets && tickets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No tickets match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — same data, table doesn't fit small screens. */}
      <div className="space-y-3 sm:hidden">
        {tickets?.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.push(`/platform/support/${t.id}`)}
            className="block w-full rounded-xl border border-border bg-card p-4 text-left"
          >
            <p className="font-medium text-foreground">{t.subject}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.createdBy.fullName} · {t.organization?.name}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={statusTone(t.status)}>{SUPPORT_STATUS_LABELS[t.status]}</Badge>
              <span className="text-xs text-muted-foreground">{SUPPORT_CATEGORY_LABELS[t.category]}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
