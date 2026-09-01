"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { MarkAttendanceModal } from "@/components/attendance/MarkAttendanceModal";
import { EnterMarksModal } from "@/components/tests/EnterMarksModal";
import type { TestDetail, TestSession } from "@/lib/types";
import { formatDate } from "@/lib/format";

function SessionStatus({ s }: { s: TestSession }) {
  if (s.cancelled) return <Badge tone="danger">Cancelled</Badge>;
  if (s.resultCount > 0) return <Badge tone="success">{s.resultCount} marks entered</Badge>;
  if (s.markedCount === 0) return <Badge tone="warning">Attendance pending</Badge>;
  if (s.presentCount === 0) return <Badge tone="danger">Nobody present</Badge>;
  return <Badge tone="accent">Marks pending</Badge>;
}

export default function TestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [test, setTest] = useState<TestDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [markAttendanceFor, setMarkAttendanceFor] = useState<TestSession | null>(null);
  const [enterMarksFor, setEnterMarksFor] = useState<TestSession | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    apiFetch<TestDetail>(`/tests/${id}`)
      .then(setTest)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this test."));
  }

  useEffect(load, [id]);

  async function handleDelete() {
    await apiFetch(`/tests/${id}`, { method: "DELETE" });
    router.push("/tests");
  }

  if (error) {
    return <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>;
  }
  if (!test) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const anyAttendance = test.sessions.some((s) => s.markedCount > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tests" className="text-sm font-medium text-accent hover:opacity-80">
          ← All tests
        </Link>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">{test.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {test.course.name} · {test.subject.name} · {test.totalMarks} marks
              {test.passingMarks !== null ? ` · pass ${test.passingMarks}` : ""}
            </p>
          </div>
          {!anyAttendance && (
            <Button variant="ghost" onClick={() => setDeleting(true)} className="w-full sm:w-auto">
              Delete test
            </Button>
          )}
        </div>
      </div>

      {(test.instructions || test.paperAssetUrl) && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          {test.instructions && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{test.instructions}</p>
            </div>
          )}
          {test.paperAssetUrl && (
            <a
              href={test.paperAssetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:opacity-80"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {test.paperAssetName ?? "View question paper"}
            </a>
          )}
        </div>
      )}

      <div>
        <p className="mb-3 text-sm font-medium text-foreground">Sessions ({test.sessions.length})</p>
        <div className="space-y-3">
          {test.sessions.map((s) => (
            <div key={s.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{s.batch.name}</p>
                    <SessionStatus s={s} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(s.date)} · {s.startTime}–{s.endTime} · Invigilator: {s.faculty.fullName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {s.markedCount}/{s.expected} marked · {s.presentCount} present
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {!s.cancelled && (
                    <Button variant="secondary" onClick={() => setMarkAttendanceFor(s)}>
                      {s.markedCount > 0 ? "Edit attendance" : "Mark attendance"}
                    </Button>
                  )}
                  {!s.cancelled && s.presentCount > 0 && (
                    <Button variant="secondary" onClick={() => setEnterMarksFor(s)}>
                      {s.resultCount > 0 ? "Edit marks" : "Enter marks"}
                    </Button>
                  )}
                  {s.resultCount > 0 && (
                    <Link href={`/tests/${test.id}/sessions/${s.id}/report`}>
                      <Button>Result sheet</Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* A test session is a Lecture row, so the existing attendance modal
          works on it unchanged. */}
      <MarkAttendanceModal lecture={markAttendanceFor} onClose={() => setMarkAttendanceFor(null)} onMarked={load} />

      {enterMarksFor && (
        <EnterMarksModal
          open={!!enterMarksFor}
          onClose={() => setEnterMarksFor(null)}
          onSaved={load}
          testId={test.id}
          session={enterMarksFor}
          totalMarks={test.totalMarks}
        />
      )}

      <ConfirmModal
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={handleDelete}
        title={`Delete "${test.title}"?`}
        description="This removes the test and all its scheduled sessions."
      />
    </div>
  );
}
