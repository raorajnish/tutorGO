"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { todayInput } from "@/lib/format";
import type { Batch, Course } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onGenerated: () => void;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

export function GenerateLecturesModal({ open, onClose, onGenerated }: Props) {
  const [startDate, setStartDate] = useState(todayInput());
  const [endDate, setEndDate] = useState(addDays(todayInput(), 30));
  const [courses, setCourses] = useState<Course[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courseId, setCourseId] = useState("");
  const [batchId, setBatchId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ createdCount: number; skippedCount: number; errors?: string[]; details?: string[] } | null>(null);

  useEffect(() => {
    if (!open) return;
    setStartDate(todayInput());
    setEndDate(addDays(todayInput(), 30));
    setCourseId("");
    setBatchId("");
    setError(null);
    setResult(null);

    apiFetch<Course[]>("/academics/courses?active=true").then(setCourses).catch(() => setCourses([]));
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
    if (!startDate || !endDate) {
      setError("Please select both start and end dates.");
      return;
    }
    if (endDate < startDate) {
      setError("End date cannot be before start date.");
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiFetch<{ createdCount: number; skippedCount: number; errors?: string[]; details?: string[] }>("/timetable/generate", {
        method: "POST",
        body: JSON.stringify({
          startDate,
          endDate,
          batchId: batchId || undefined,
        }),
      });
      setResult(res);
      onGenerated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not generate lectures.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setResult(null);
    onClose();
  }

  if (result) {
    const errorList = result.errors ?? result.details ?? [];
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Lectures Generated"
        description="Weekly timetable slots have been converted into dated lecture sessions."
        width="md"
        footer={<Button onClick={handleClose}>Done</Button>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-success/30 bg-success-soft p-4 text-sm text-success">
            <p className="font-semibold">Generation complete!</p>
            <ul className="mt-1.5 list-disc pl-5 space-y-1 text-xs">
              <li><strong>{result.createdCount}</strong> new dated lecture(s) created.</li>
              <li><strong>{result.skippedCount}</strong> slot instance(s) skipped (already existing or clashing).</li>
            </ul>
          </div>

          {result.createdCount === 0 && result.skippedCount === 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning space-y-1">
              <p className="font-semibold">No Timetable Slots Found</p>
              <p className="text-xs">
                To generate lectures, first create your weekly recurring schedule by clicking <strong>+ Add Slot</strong> in the Weekly Timetable tab!
              </p>
            </div>
          )}

          {errorList.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning space-y-2">
              <p className="font-semibold">Clashes / Skipped Slots ({errorList.length}):</p>
              <div className="max-h-40 overflow-y-auto space-y-1 text-xs font-mono">
                {errorList.map((errStr, idx) => (
                  <div key={idx} className="border-b border-warning/20 pb-1 last:border-0">
                    {errStr}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Generate Lectures from Timetable"
      description="Bulk generate dated lectures for upcoming weeks based on recurring weekly timetable slots."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" form="generate-lectures-form" disabled={submitting}>
            {submitting ? "Generating…" : "Generate lectures"}
          </Button>
        </>
      }
    >
      <form id="generate-lectures-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="From date" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="To date" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dropdown
            label="Course filter (optional)"
            value={courseId}
            onChange={setCourseId}
            options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
            placeholder="All courses"
          />
          <Dropdown
            label="Batch filter (optional)"
            value={batchId}
            onChange={setBatchId}
            options={batches.map((b) => ({ value: b.id, label: b.name }))}
            placeholder={courseId ? "All batches in course" : "Select course first"}
            disabled={!courseId}
          />
        </div>

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
