"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { ScheduleTestModal } from "@/components/tests/ScheduleTestModal";
import type { TestListItem } from "@/lib/types";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function TestsPage() {
  const router = useRouter();
  const [tests, setTests] = useState<TestListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  function load() {
    apiFetch<TestListItem[]>("/tests")
      .then(setTests)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load tests."));
  }

  useEffect(load, []);

  const graded = tests?.filter((t) => t.resultCount > 0).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Tests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule tests per batch, assign invigilators, then record attendance and marks.
          </p>
        </div>
        <Button onClick={() => setScheduleOpen(true)} className="w-full sm:w-auto">
          Schedule test
        </Button>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Tests" value={tests?.length ?? 0} tone="primary" />
        <StatCard label="Sessions scheduled" value={tests?.reduce((n, t) => n + t.sessionCount, 0) ?? 0} tone="accent" />
        <StatCard label="With results" value={graded} tone="success" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Table on desktop, stacked cards on mobile — same pattern as the platform lists. */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Test</th>
                <th className="px-4 py-2.5">Course · Subject</th>
                <th className="px-4 py-2.5">Batches</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Marks</th>
                <th className="px-4 py-2.5">Results</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tests?.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/tests/${t.id}`)}
                  className="cursor-pointer transition-colors hover:bg-muted"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{t.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.course.name} · {t.subject.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{t.batches.join(", ") || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(t.firstDate)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t.totalMarks}</td>
                  <td className="px-4 py-3">
                    {t.resultCount > 0 ? (
                      <Badge tone="success">{t.resultCount} entered</Badge>
                    ) : (
                      <Badge tone="warning">Pending</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {tests && tests.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No tests scheduled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {tests?.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => router.push(`/tests/${t.id}`)}
              className="block w-full space-y-1.5 p-4 text-left transition-colors hover:bg-muted"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-foreground">{t.title}</p>
                {t.resultCount > 0 ? <Badge tone="success">Results in</Badge> : <Badge tone="warning">Pending</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {t.course.name} · {t.subject.name} · {t.totalMarks} marks
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(t.firstDate)} · {t.batches.join(", ") || "No batches"}
              </p>
            </button>
          ))}
          {tests && tests.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">No tests scheduled yet.</p>
          )}
        </div>
      </div>

      <ScheduleTestModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} onScheduled={load} />
    </div>
  );
}
