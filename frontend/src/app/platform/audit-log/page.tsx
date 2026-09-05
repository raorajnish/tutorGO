"use client";

import { Fragment, useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { SkeletonRow } from "@/components/ui/Skeleton";
import type { PlatformInstituteListItem } from "@/lib/types";
import { formatDate } from "@/lib/format";

interface AuditLogRow {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; fullName: string; email: string } | null;
  organization: { id: string; name: string } | null;
  institute: { id: string; name: string } | null;
}

interface AuditLogResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: AuditLogRow[];
}

export default function AuditLogPage() {
  const [data, setData] = useState<AuditLogResponse | null>(null);
  const [institutes, setInstitutes] = useState<PlatformInstituteListItem[]>([]);
  const [instituteId, setInstituteId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Static-ish lookup for the filter dropdown — fetched once, not on every
  // filter change, same reasoning as the course lookup on the Analytics tab.
  useEffect(() => {
    apiFetch<PlatformInstituteListItem[]>("/platform/institutes")
      .then(setInstitutes)
      .catch(() => setInstitutes([]));
  }, []);

  async function load() {
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (instituteId) qs.set("instituteId", instituteId);
      if (action) qs.set("action", action);
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      setData(await apiFetch<AuditLogResponse>(`/platform/audit-log?${qs.toString()}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load the audit log.");
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instituteId, action, from, to, page]);

  // Any filter change resets to page 1 — otherwise a filtered-down result
  // set could leave the view stranded on a page that no longer exists.
  useEffect(() => setPage(1), [instituteId, action, from, to]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Audit log</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every platform-side action. Shows all institutes by default — narrow to one below.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[220px] flex-1">
          <Dropdown
            label="Institute"
            value={instituteId}
            onChange={setInstituteId}
            options={[
              { value: "", label: "All institutes" },
              ...institutes.map((i) => ({ value: i.id, label: `${i.name} (${i.organization.name})` })),
            ]}
            placeholder="All institutes"
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <Input label="Action contains" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. SUSPENDED" />
        </div>
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Action</th>
              <th className="px-4 py-2.5">Actor</th>
              <th className="px-4 py-2.5">Organization / Institute</th>
              <th className="px-4 py-2.5">Target</th>
              <th className="px-4 py-2.5">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data === null &&
              Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={5}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
            {data?.rows.map((r) => (
              <Fragment key={r.id}>
                <tr
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="cursor-pointer transition-colors hover:bg-secondary"
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{r.action}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.actor ? `${r.actor.fullName}` : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.organization?.name ?? "—"}
                    {r.institute && <span className="block text-xs">{r.institute.name}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.targetType ? `${r.targetType}` : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.createdAt, { year: false })}</td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan={5} className="bg-muted px-4 py-3">
                      <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                        {JSON.stringify({ targetId: r.targetId, actorEmail: r.actor?.email, metadata: r.metadata }, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {data && data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No matching entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 sm:hidden">
        {data?.rows.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            className="block w-full rounded-xl border border-border bg-card p-4 text-left"
          >
            <p className="font-mono text-xs font-semibold text-foreground">{r.action}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.actor?.fullName ?? "—"} · {r.organization?.name ?? "—"}
              {r.institute && ` · ${r.institute.name}`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{formatDate(r.createdAt, { year: false })}</p>
            {expanded === r.id && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-[11px] text-muted-foreground">
                {JSON.stringify({ targetId: r.targetId, actorEmail: r.actor?.email, metadata: r.metadata }, null, 2)}
              </pre>
            )}
          </button>
        ))}
      </div>

      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {data.page} of {totalPages} · {data.total} total
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
