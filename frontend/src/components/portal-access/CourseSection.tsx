"use client";

import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Toggle } from "@/components/ui/Toggle";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PortalStatusBadge } from "./StatusBadge";
import { formatDate } from "@/lib/format";
import type { BulkIssueResult, IssueCredentialResult, PortalAccessCourse, PortalAccessStudent } from "@/lib/types";

const CHEVRON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Shown only when the credential email could not be delivered — the server
 * returns the temp password in that one case so staff can pass it on another
 * way, rather than leaving the student with no route in. */
function FallbackPassword({ password }: { password: string }) {
  return (
    <div className="mt-2 rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
      The email could not be delivered. Share this temporary password directly:{" "}
      <code className="rounded bg-card px-1.5 py-0.5 font-mono text-foreground">{password}</code>
    </div>
  );
}

export function CourseSection({
  course,
  onChanged,
  onEditEmail,
}: {
  course: PortalAccessCourse;
  onChanged: () => void;
  onEditEmail: (student: PortalAccessStudent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<{ studentId: string; password: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkIssueResult | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [togglingPortal, setTogglingPortal] = useState(false);

  async function togglePortal(next: boolean) {
    setTogglingPortal(true);
    setError(null);
    try {
      await apiFetch(`/portal-access/courses/${course.id}`, {
        method: "PATCH",
        body: JSON.stringify({ portalEnabled: next }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update portal access.");
    } finally {
      setTogglingPortal(false);
    }
  }

  async function issue(student: PortalAccessStudent, action: "issue" | "resend") {
    setBusyId(student.id);
    setError(null);
    setFallback(null);
    try {
      const result = await apiFetch<IssueCredentialResult>(
        `/portal-access/students/${student.id}/${action}`,
        { method: "POST" }
      );
      if (!result.emailDelivered && result.tempPassword) {
        setFallback({ studentId: student.id, password: result.tempPassword });
      }
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send credentials.");
    } finally {
      setBusyId(null);
    }
  }

  async function issueAll() {
    setBusyId("__bulk__");
    setError(null);
    try {
      const result = await apiFetch<BulkIssueResult>(`/portal-access/courses/${course.id}/issue-all`, {
        method: "POST",
      });
      setBulkResult(result);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send credentials.");
    } finally {
      setBusyId(null);
    }
  }

  const term = search.trim().toLowerCase();
  const students = term
    ? course.students.filter((s) => s.name.toLowerCase().includes(term) || s.email.toLowerCase().includes(term))
    : course.students;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Course header — always visible, tappable to expand. */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-transform duration-150 ${
              open ? "rotate-90" : ""
            }`}
          >
            {CHEVRON}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-foreground">{course.name}</span>
              <Badge tone="neutral">{course.code}</Badge>
              {!course.isActive && <Badge tone="neutral">Inactive</Badge>}
            </span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {course.counts.total} student{course.counts.total === 1 ? "" : "s"}
              {course.portalEnabled && (
                <>
                  {" · "}
                  {course.counts.active} active
                  {course.counts.pending > 0 && ` · ${course.counts.pending} pending`}
                </>
              )}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-3 pl-10 sm:pl-0">
          <span className="text-xs font-medium text-muted-foreground">Portal access</span>
          <Toggle
            checked={course.portalEnabled}
            onChange={togglePortal}
            disabled={togglingPortal}
            label={`Portal access for ${course.name}`}
          />
        </div>
      </div>

      {error && <div className="border-t border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

      {bulkResult && (
        <div className="border-t border-border bg-muted px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-foreground">
              <span className="font-semibold">{bulkResult.issued}</span> sent
              {bulkResult.failed > 0 && (
                <>
                  {", "}
                  <span className="font-semibold text-danger">{bulkResult.failed}</span> failed
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setBulkResult(null)}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          {bulkResult.results
            .filter((r) => r.outcome === "FAILED")
            .map((r) => (
              <p key={r.studentId} className="mt-1 text-xs text-danger">
                {r.name}: {r.message}
              </p>
            ))}
        </div>
      )}

      {open && (
        <div className="border-t border-border">
          {!course.portalEnabled && (
            <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
              Portal access is off for this course, so nobody here can sign in. Turning it on or off never touches a
              student&apos;s attendance, test or fee records.
            </p>
          )}

          {course.students.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No active students in this course.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <Input
                  placeholder="Search this course…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:max-w-xs"
                />
                {course.portalEnabled && course.counts.pending > 0 && (
                  <Button onClick={() => setBulkOpen(true)} disabled={busyId === "__bulk__"} className="shrink-0">
                    {busyId === "__bulk__" ? "Sending…" : `Send to all pending (${course.counts.pending})`}
                  </Button>
                )}
              </div>

              <ul className="divide-y divide-border">
                {students.map((s) => (
                  <li key={s.id} className="px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-foreground">{s.name}</p>
                          <PortalStatusBadge status={s.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.email}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {s.batch?.name ?? "No batch"}
                          {s.hasLogin && (
                            <>
                              {" · "}
                              {s.awaitingFirstLogin ? "Hasn't signed in yet" : `Last signed in ${formatDate(s.lastLoginAt)}`}
                            </>
                          )}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2">
                        {s.status === "PENDING" && (
                          <Button onClick={() => issue(s, "issue")} disabled={busyId === s.id}>
                            {busyId === s.id ? "Sending…" : "Send credentials"}
                          </Button>
                        )}
                        {(s.status === "ACTIVE" || s.status === "SUSPENDED") && (
                          <Button variant="secondary" onClick={() => issue(s, "resend")} disabled={busyId === s.id}>
                            {busyId === s.id ? "Sending…" : "Resend"}
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => onEditEmail(s)}>
                          Edit email
                        </Button>
                      </div>
                    </div>

                    {fallback?.studentId === s.id && <FallbackPassword password={fallback.password} />}
                  </li>
                ))}
                {students.length === 0 && (
                  <li className="px-4 py-6 text-center text-sm text-muted-foreground">No students match that search.</li>
                )}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onConfirm={issueAll}
        title={`Send credentials to ${course.counts.pending} student${course.counts.pending === 1 ? "" : "s"}?`}
        description={`Everyone in ${course.name} without a working login is emailed a temporary password. Students who already have one are left alone.`}
        confirmLabel="Send credentials"
        destructive={false}
      />
    </div>
  );
}
