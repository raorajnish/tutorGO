"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError, getToken } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import type { Batch, Course, SelfFillStatusRow } from "@/lib/types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function SelfFillTab({ courses }: { courses: Course[] }) {
  const [courseId, setCourseId] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [rows, setRows] = useState<SelfFillStatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [precreateOpen, setPrecreateOpen] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newPin, setNewPin] = useState<{ name: string; pin: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Single institute-wide link, always the same path — studentCode is
  // globally unique so the form doesn't need a course/batch in the URL to
  // know who's filling it in. Computed client-side (not a server call) since
  // it's just "this origin + /admission-form".
  const admissionLink = typeof window !== "undefined" ? `${window.location.origin}/admission-form` : "/admission-form";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(admissionLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError("Could not copy the link — copy it manually from the box above.");
    }
  }

  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setBatchId("");
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [courseId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (courseId) params.set("courseId", courseId);
      if (batchId) params.set("batchId", batchId);
      const data = await apiFetch<SelfFillStatusRow[]>(`/students/self-fill-status?${params.toString()}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load self-fill status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, batchId]);

  async function downloadFile(path: string, filename: string) {
    const token = getToken();
    const res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      setError("Could not export the roster — set up a course and batch with pending students first.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId);
    if (batchId) params.set("batchId", batchId);
    downloadFile(`/students/roster.csv?${params.toString()}`, "admission-roster.csv");
  }

  function openPrintRoster() {
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId);
    if (batchId) params.set("batchId", batchId);
    window.open(`/students-roster-print?${params.toString()}`, "_blank");
  }

  async function reopen(id: string, name: string) {
    setBusyId(id);
    try {
      // Reopening issues a brand-new PIN (the old one was cleared on
      // completion, so there's nothing left to reuse) — shown here since
      // this is the only moment staff can see it to relay to the student.
      const res = await apiFetch<{ selfFillPin: string }>(`/students/${id}/self-fill/reopen`, { method: "POST" });
      setNewPin({ name, pin: res.selfFillPin });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reopen this profile.");
    } finally {
      setBusyId(null);
    }
  }

  async function resetLock(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/students/${id}/self-fill/reset-lock`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reset this lock.");
    } finally {
      setBusyId(null);
    }
  }

  const filledCount = rows.filter((r) => r.profileCompletedAt !== null).length;

  return (
    <div className="space-y-4">
      <div className="mx-4 mt-4 rounded-xl border border-border bg-muted p-3.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Admission link</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Share this with students — they&apos;ll enter their Student ID + code from the roster below to fill in their own
          details.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={admissionLink}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs text-foreground"
          />
          <Button variant="secondary" onClick={copyLink} className="shrink-0">
            {linkCopied ? "Copied!" : "Copy link"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <div className="w-full max-w-[220px]">
            <Dropdown
              value={courseId}
              onChange={setCourseId}
              options={[{ value: "", label: "All courses" }, ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))]}
              placeholder="All courses"
            />
          </div>
          <div className="w-full max-w-[220px]">
            <Dropdown
              value={batchId}
              onChange={setBatchId}
              options={[{ value: "", label: "All batches" }, ...batches.map((b) => ({ value: b.id, label: b.name }))]}
              placeholder="All batches"
              disabled={!courseId}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCsv} disabled={!courseId && !batchId}>
            Export CSV
          </Button>
          <Button variant="secondary" onClick={openPrintRoster} disabled={!courseId && !batchId}>
            Print roster
          </Button>
          <Button variant="secondary" onClick={() => setEnableOpen(true)}>
            Enable for existing students
          </Button>
          <Button onClick={() => setPrecreateOpen(true)}>Bulk pre-create</Button>
        </div>
      </div>

      {error && <div className="border-y border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

      {newPin && (
        <div className="mx-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success">
          <span>
            New code for <strong>{newPin.name}</strong>: <span className="font-mono text-base">{newPin.pin}</span> — share this
            with them so they can log back in.
          </span>
          <button type="button" onClick={() => setNewPin(null)} className="text-xs font-medium underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}

      <p className="px-4 text-sm text-muted-foreground">
        {loading ? "Loading…" : `${filledCount} of ${rows.length} filled in`}
      </p>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted">
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.studentCode}</p>
                </td>
                <td className="px-4 py-3 text-foreground">
                  {r.course.name} ({r.course.code})
                </td>
                <td className="px-4 py-3">
                  {r.profileCompletedAt ? (
                    <Badge tone="success">Filled {fmtDate(r.profileCompletedAt)}</Badge>
                  ) : r.selfFillLocked ? (
                    <Badge tone="danger">Locked</Badge>
                  ) : (
                    <Badge tone="neutral">Pending</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {r.profileCompletedAt && (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => reopen(r.id, r.name)}
                        className="text-xs font-medium text-accent underline underline-offset-2 disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                    {r.selfFillLocked && (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => resetLock(r.id)}
                        className="text-xs font-medium text-accent underline underline-offset-2 disabled:opacity-50"
                      >
                        Unlock
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No pre-created students yet. Use &quot;Bulk pre-create&quot; to add some.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border sm:hidden">
        {rows.map((r) => (
          <div key={r.id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-foreground">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.studentCode}</p>
              </div>
              {r.profileCompletedAt ? (
                <Badge tone="success">Filled</Badge>
              ) : r.selfFillLocked ? (
                <Badge tone="danger">Locked</Badge>
              ) : (
                <Badge tone="neutral">Pending</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {r.course.name} ({r.course.code})
            </p>
            <div className="flex gap-3">
              {r.profileCompletedAt && (
                <button type="button" disabled={busyId === r.id} onClick={() => reopen(r.id, r.name)} className="text-xs font-medium text-accent underline underline-offset-2">
                  Reopen
                </button>
              )}
              {r.selfFillLocked && (
                <button type="button" disabled={busyId === r.id} onClick={() => resetLock(r.id)} className="text-xs font-medium text-accent underline underline-offset-2">
                  Unlock
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No pre-created students yet.</p>
        )}
      </div>

      <BulkPrecreateModal
        open={precreateOpen}
        onClose={() => setPrecreateOpen(false)}
        onCreated={load}
        courses={courses}
      />
      <EnableExistingModal open={enableOpen} onClose={() => setEnableOpen(false)} onEnabled={load} courses={courses} />
    </div>
  );
}

interface CreatedRow {
  id: string;
  name: string;
  studentCode: string;
  selfFillPin: string;
}

function BulkPrecreateModal({
  open,
  onClose,
  onCreated,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  courses: Course[];
}) {
  const [courseId, setCourseId] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [namesText, setNamesText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CreatedRow[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setCourseId("");
    setBatchId("");
    setNamesText("");
    setError(null);
    setResult(null);
  }, [open]);

  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setBatchId("");
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [courseId]);

  const names = namesText
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!courseId || !batchId) {
      setError("Pick a course and batch.");
      return;
    }
    if (names.length === 0) {
      setError("Enter at least one name.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<{ students: CreatedRow[] }>("/students/bulk-precreate", {
        method: "POST",
        body: JSON.stringify({ courseId, batchId, names }),
      });
      setResult(res.students);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create these students.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk pre-create students"
      description="Name + course/batch only — students fill in the rest themselves via the admission link."
      width="md"
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="bulk-precreate-form" disabled={submitting}>
              {submitting ? "Creating…" : `Create ${names.length || ""} student${names.length === 1 ? "" : "s"}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success">
            {result.length} student{result.length === 1 ? "" : "s"} created. Export the roster from the previous screen to print
            their IDs and codes.
          </div>
          <PinResultTable rows={result} />
        </div>
      ) : (
        <form id="bulk-precreate-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dropdown
              label="Course"
              value={courseId}
              onChange={setCourseId}
              options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
              placeholder="Select course…"
            />
            <Dropdown
              label="Batch"
              value={batchId}
              onChange={setBatchId}
              options={batches.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={courseId ? "Select batch…" : "Pick a course first"}
              disabled={!courseId}
            />
          </div>
          <Textarea
            label="Student names (one per line)"
            value={namesText}
            onChange={(e) => setNamesText(e.target.value)}
            rows={8}
            placeholder={"Aditya Sharma\nPriya Patel\nRohan Mehta"}
          />
          {names.length > 0 && <p className="text-xs text-muted-foreground">{names.length} name{names.length === 1 ? "" : "s"} entered</p>}
          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
        </form>
      )}
    </Modal>
  );
}

function PinResultTable({ rows }: { rows: CreatedRow[] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-border">
      <table className="w-full min-w-[360px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Student ID</th>
            <th className="px-3 py-2 font-medium">Code</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 text-foreground">{r.name}</td>
              <td className="px-3 py-2 font-mono text-xs text-foreground">{r.studentCode}</td>
              <td className="px-3 py-2 font-mono text-xs text-foreground">{r.selfFillPin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface EnableResponse {
  students: CreatedRow[];
  alreadyEnabledCount: number;
}

/** For students who already have a full record (admitted the normal way,
 * via AdmitModal) but with incomplete details — retrofits self-fill onto
 * their EXISTING row instead of creating a duplicate. Scoped by course +
 * batch, same picker as bulk pre-create, but selects from students already
 * in that batch rather than asking for names. */
function EnableExistingModal({
  open,
  onClose,
  onEnabled,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  onEnabled: () => void;
  courses: Course[];
}) {
  const [courseId, setCourseId] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EnableResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    setCourseId("");
    setBatchId("");
    setError(null);
    setResult(null);
  }, [open]);

  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setBatchId("");
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [courseId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!courseId || !batchId) {
      setError("Pick a course and batch.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<EnableResponse>("/students/self-fill/enable", {
        method: "POST",
        body: JSON.stringify({ courseId, batchId }),
      });
      setResult(res);
      onEnabled();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not enable self-fill for this batch.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enable self-fill for existing students"
      description="For students already admitted with incomplete details — every active student in the batch gets a code, without creating a duplicate record."
      width="md"
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="enable-existing-form" disabled={submitting || !courseId || !batchId}>
              {submitting ? "Enabling…" : "Enable self-fill"}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          {result.students.length > 0 ? (
            <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success">
              {result.students.length} student{result.students.length === 1 ? "" : "s"} enabled. Export the roster from the
              previous screen to print their IDs and codes.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
              Nobody new to enable — every active student in this batch already has self-fill on.
            </div>
          )}
          {result.alreadyEnabledCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {result.alreadyEnabledCount} student{result.alreadyEnabledCount === 1 ? " was" : "s were"} already enabled and
              left untouched — their existing code still works.
            </p>
          )}
          {result.students.length > 0 && <PinResultTable rows={result.students} />}
        </div>
      ) : (
        <form id="enable-existing-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dropdown
              label="Course"
              value={courseId}
              onChange={setCourseId}
              options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
              placeholder="Select course…"
            />
            <Dropdown
              label="Batch"
              value={batchId}
              onChange={setBatchId}
              options={batches.map((b) => ({ value: b.id, label: b.name }))}
              placeholder={courseId ? "Select batch…" : "Pick a course first"}
              disabled={!courseId}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Every currently-active student in this batch who doesn&apos;t already have self-fill on will get a fresh code.
            Students who&apos;ve already had self-fill enabled (or already filled everything in) are left alone.
          </p>
          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
        </form>
      )}
    </Modal>
  );
}
