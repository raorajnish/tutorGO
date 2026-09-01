"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
import { TestPaperUpload } from "./TestPaperUpload";
import type {
  Batch,
  Course,
  CreateTestPayload,
  Invigilator,
  ScheduleConflict,
  Test,
  TestPaperAsset,
  TestSessionPayload,
} from "@/lib/types";
import { todayInput } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: (test: Test) => void;
}

// 30 mins through 6 hrs — tests are typically shorter than lectures.
const DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const totalMinutes = (i + 1) * 30;
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const label = hrs === 0 ? `${mins} mins` : mins === 0 ? `${hrs} hr${hrs > 1 ? "s" : ""}` : `${hrs} hr ${mins} mins`;
  return { value: String(totalMinutes), label };
});

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

interface SessionDraft {
  batchId: string;
  batchName: string;
  date: string;
  startTime: string;
  duration: string;
  invigilatorId: string;
}

export function ScheduleTestModal({ open, onClose, onScheduled }: Props) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [subjects, setSubjects] = useState<{ id: string; name: string; shortCode: string }[]>([]);
  const [invigilators, setInvigilators] = useState<Invigilator[]>([]);

  const [courseId, setCourseId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [passingMarks, setPassingMarks] = useState("");
  const [instructions, setInstructions] = useState("");
  const [paper, setPaper] = useState<TestPaperAsset | null>(null);

  // Defaults applied to every selected batch; each row can then diverge.
  const [defaultDate, setDefaultDate] = useState(todayInput());
  const [defaultStart, setDefaultStart] = useState("");
  const [defaultDuration, setDefaultDuration] = useState("60");
  const [defaultInvigilator, setDefaultInvigilator] = useState("");

  const [sessions, setSessions] = useState<SessionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setCourseId("");
    setSubjectId("");
    setTitle("");
    setTotalMarks("");
    setPassingMarks("");
    setInstructions("");
    setPaper(null);
    setDefaultDate(todayInput());
    setDefaultStart("");
    setDefaultDuration("60");
    setDefaultInvigilator("");
    setSessions([]);
    setError(null);
    setConflicts(null);

    apiFetch<Course[]>("/academics/courses?active=true").then(setCourses).catch(() => {});
    apiFetch<Invigilator[]>("/tests/invigilators").then(setInvigilators).catch(() => {});
  }, [open]);

  // Course chosen → load its batches and subjects. A single-batch course is
  // pre-selected, since there's nothing to choose.
  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setSubjects([]);
      setSessions([]);
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then((data) => {
        setBatches(data);
        setSessions(data.length === 1 ? [draftFor(data[0]!)] : []);
      })
      .catch(() => setBatches([]));

    apiFetch<{ id: string; name: string; shortCode: string; courses: { id: string }[] }[]>("/academics/subjects")
      .then((all) => {
        const forCourse = all.filter((s) => s.courses.some((c) => c.id === courseId));
        setSubjects(forCourse);
        setSubjectId(forCourse.length === 1 ? forCourse[0]!.id : "");
      })
      .catch(() => setSubjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  function draftFor(batch: Batch): SessionDraft {
    return {
      batchId: batch.id,
      batchName: batch.name,
      date: defaultDate,
      startTime: defaultStart,
      duration: defaultDuration,
      invigilatorId: defaultInvigilator,
    };
  }

  // Editing a default re-applies it to every row that still matched the old
  // default, so "set it once at the top" keeps working after rows are added.
  function applyDefault(patch: Partial<Pick<SessionDraft, "date" | "startTime" | "duration" | "invigilatorId">>) {
    setSessions((prev) => prev.map((s) => ({ ...s, ...patch })));
  }

  function toggleBatch(batch: Batch) {
    setSessions((prev) =>
      prev.some((s) => s.batchId === batch.id) ? prev.filter((s) => s.batchId !== batch.id) : [...prev, draftFor(batch)]
    );
  }

  function toggleAll() {
    setSessions((prev) => (prev.length === batches.length ? [] : batches.map(draftFor)));
  }

  function updateSession(batchId: string, patch: Partial<SessionDraft>) {
    setSessions((prev) => prev.map((s) => (s.batchId === batchId ? { ...s, ...patch } : s)));
  }

  async function submit(acceptSplitFor: string[]) {
    setError(null);
    setSubmitting(true);

    const payload: CreateTestPayload = {
      courseId,
      subjectId,
      title,
      totalMarks: Number(totalMarks),
      passingMarks: passingMarks ? Number(passingMarks) : undefined,
      instructions: instructions || undefined,
      paperAssetUrl: paper?.url,
      paperAssetType: paper?.type,
      paperAssetName: paper?.name,
      sessions: sessions.map<TestSessionPayload>((s) => ({
        batchId: s.batchId,
        date: s.date,
        startTime: s.startTime,
        endTime: addMinutes(s.startTime, Number(s.duration)),
        invigilatorId: s.invigilatorId,
      })),
      acceptSplitFor,
    };

    try {
      const created = await apiFetch<Test>("/tests", { method: "POST", body: JSON.stringify(payload) });
      onScheduled(created);
      onClose();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "SPLIT_REQUIRED") {
        const body = err.body as { conflicts?: ScheduleConflict[] } | null;
        setConflicts(body?.conflicts ?? []);
      } else {
        setError(err instanceof ApiClientError ? err.message : "Could not schedule this test.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!courseId || !subjectId) return setError("Select a course and subject.");
    if (!title.trim()) return setError("Give this test a title.");
    if (!totalMarks || Number(totalMarks) <= 0) return setError("Enter the total marks.");
    if (passingMarks && Number(passingMarks) > Number(totalMarks)) {
      return setError("Passing marks can't exceed total marks.");
    }
    if (sessions.length === 0) return setError("Select at least one batch.");
    for (const s of sessions) {
      if (!s.startTime) return setError(`Set a start time for ${s.batchName}.`);
      if (!s.invigilatorId) return setError(`Pick an invigilator for ${s.batchName}.`);
    }
    void submit([]);
  }

  const invigilatorOptions = invigilators.map((i) => ({
    value: i.id,
    label: `${i.fullName} · ${i.role.charAt(0)}${i.role.slice(1).toLowerCase()}`,
  }));

  // The admin has to decide what happens to the lecture(s) this test lands
  // inside of before anything is created.
  if (conflicts) {
    return (
      <Modal
        open={open}
        onClose={() => setConflicts(null)}
        title="This clashes with a scheduled lecture"
        description="Split the lecture around the test, or go back and pick another slot."
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConflicts(null)} disabled={submitting}>
              Back
            </Button>
            <Button
              onClick={() => void submit(conflicts.map((c) => c.split.conflictLectureId))}
              disabled={submitting}
            >
              {submitting ? "Scheduling…" : "Split & schedule"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {conflicts.map((c) => (
            <div key={c.split.conflictLectureId} className="rounded-xl border border-warning/30 bg-warning-soft p-3.5">
              <p className="text-sm font-medium text-foreground">{c.batchName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{c.split.conflictLabel}</p>
              <p className="mt-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Becomes</p>
              <ul className="mt-1 space-y-1 text-sm text-foreground">
                {c.split.before && (
                  <li>
                    {c.split.before.startTime}–{c.split.before.endTime} · lecture
                  </li>
                )}
                <li className="font-medium">Test slot</li>
                {c.split.after && (
                  <li>
                    {c.split.after.startTime}–{c.split.after.endTime} · lecture
                  </li>
                )}
              </ul>
            </div>
          ))}
          {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
        </div>
      </Modal>
    );
  }

  const allSelected = batches.length > 0 && sessions.length === batches.length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Schedule test"
      description="Set the paper once, then schedule it for every batch that sits it."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="schedule-test-form" disabled={submitting || sessions.length === 0}>
            {submitting ? "Scheduling…" : `Schedule test${sessions.length > 1 ? ` (${sessions.length} batches)` : ""}`}
          </Button>
        </>
      }
    >
      <form id="schedule-test-form" onSubmit={handleSubmit} className="space-y-6">
        <section className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Dropdown
              label="Course"
              value={courseId}
              onChange={setCourseId}
              options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
              placeholder="Select course…"
            />
            <Dropdown
              label="Subject"
              value={subjectId}
              onChange={setSubjectId}
              options={subjects.map((s) => ({ value: s.id, label: `${s.name} (${s.shortCode})` }))}
              placeholder={courseId ? "Select subject…" : "Select a course first"}
              disabled={!courseId}
            />
          </div>

          <Input
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Unit Test 2 — Thermodynamics"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Total marks"
              type="number"
              min="1"
              required
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
            />
            <Input
              label="Passing marks (optional)"
              type="number"
              min="0"
              value={passingMarks}
              onChange={(e) => setPassingMarks(e.target.value)}
            />
          </div>

          <Textarea
            label="Instructions (optional)"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={2000}
            placeholder="e.g. All questions compulsory. Calculators not allowed."
          />

          <TestPaperUpload value={paper} onChange={setPaper} />
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Batches sitting this test</p>
            {batches.length > 1 && (
              <button type="button" onClick={toggleAll} className="text-sm font-medium text-accent transition-opacity hover:opacity-80">
                {allSelected ? "Clear all" : "Select all"}
              </button>
            )}
          </div>

          {!courseId && <p className="text-sm text-muted-foreground">Select a course to see its batches.</p>}
          {courseId && batches.length === 0 && (
            <p className="text-sm text-muted-foreground">This course has no batches yet.</p>
          )}

          {batches.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {batches.map((b) => {
                const selected = sessions.some((s) => s.batchId === b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBatch(b)}
                    className={`rounded-xl border px-3 py-1.5 text-sm transition-colors ${
                      selected
                        ? "border-primary bg-secondary text-secondary-foreground"
                        : "border-border text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {b.name}
                  </button>
                );
              })}
            </div>
          )}
          {batches.length === 1 && sessions.length === 1 && (
            <Badge tone="primary">{batches[0]!.name} — the only batch on this course</Badge>
          )}
        </section>

        {sessions.length > 0 && (
          <section className="space-y-3 border-t border-border pt-5">
            <p className="text-sm font-medium text-foreground">
              {sessions.length > 1 ? "When & who — set once, adjust any batch below" : "When & who"}
            </p>

            {sessions.length > 1 && (
              <div className="grid grid-cols-1 gap-3 rounded-xl bg-muted p-3 sm:grid-cols-2 lg:grid-cols-4">
                <Input
                  label="Date"
                  type="date"
                  min={todayInput()}
                  value={defaultDate}
                  onChange={(e) => {
                    setDefaultDate(e.target.value);
                    applyDefault({ date: e.target.value });
                  }}
                />
                <Input
                  label="Start"
                  type="time"
                  value={defaultStart}
                  onChange={(e) => {
                    setDefaultStart(e.target.value);
                    applyDefault({ startTime: e.target.value });
                  }}
                />
                <Dropdown
                  label="Duration"
                  value={defaultDuration}
                  onChange={(v) => {
                    setDefaultDuration(v);
                    applyDefault({ duration: v });
                  }}
                  options={DURATION_OPTIONS}
                />
                <Dropdown
                  label="Invigilator"
                  value={defaultInvigilator}
                  onChange={(v) => {
                    setDefaultInvigilator(v);
                    applyDefault({ invigilatorId: v });
                  }}
                  options={invigilatorOptions}
                  placeholder="Select…"
                />
              </div>
            )}

            <div className="space-y-3">
              {sessions.map((s) => (
                <div key={s.batchId} className="rounded-xl border border-border p-3.5">
                  {sessions.length > 1 && <p className="mb-2.5 text-sm font-medium text-foreground">{s.batchName}</p>}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Input
                      label="Date"
                      type="date"
                      min={todayInput()}
                      value={s.date}
                      onChange={(e) => updateSession(s.batchId, { date: e.target.value })}
                    />
                    <Input
                      label="Start time"
                      type="time"
                      value={s.startTime}
                      onChange={(e) => updateSession(s.batchId, { startTime: e.target.value })}
                    />
                    <Dropdown
                      label="Duration"
                      value={s.duration}
                      onChange={(v) => updateSession(s.batchId, { duration: v })}
                      options={DURATION_OPTIONS}
                    />
                    <Dropdown
                      label="Invigilator"
                      value={s.invigilatorId}
                      onChange={(v) => updateSession(s.batchId, { invigilatorId: v })}
                      options={invigilatorOptions}
                      placeholder="Select…"
                    />
                  </div>
                  {s.startTime && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Ends at {addMinutes(s.startTime, Number(s.duration))}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}

export { addMinutes };
