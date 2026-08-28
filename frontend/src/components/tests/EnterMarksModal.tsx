"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import type { TestReport, TestSession } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  testId: string;
  session: TestSession;
  totalMarks: number;
}

export function EnterMarksModal({ open, onClose, onSaved, testId, session, totalMarks }: Props) {
  const [report, setReport] = useState<TestReport | null>(null);
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    apiFetch<TestReport>(`/tests/${testId}/sessions/${session.id}/report`)
      .then((data) => {
        setReport(data);
        setMarks(
          Object.fromEntries(
            data.rows.filter((r) => r.marksObtained !== null).map((r) => [r.student.id, String(Number(r.marksObtained))])
          )
        );
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load the roster."));
  }, [open, testId, session.id]);

  // Only students who actually sat the test can be graded — the server
  // enforces this too, this just keeps them off the screen entirely.
  const gradable = report?.rows.filter((r) => r.present) ?? [];

  async function handleSave() {
    const results = gradable
      .filter((r) => marks[r.student.id] !== undefined && marks[r.student.id] !== "")
      .map((r) => ({ studentId: r.student.id, marksObtained: Number(marks[r.student.id]) }));

    if (results.length === 0) return setError("Enter marks for at least one student.");
    const over = results.find((r) => r.marksObtained > totalMarks);
    if (over) return setError(`Marks can't exceed the total of ${totalMarks}.`);
    const negative = results.find((r) => r.marksObtained < 0 || Number.isNaN(r.marksObtained));
    if (negative) return setError("Marks must be a number of zero or more.");

    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/tests/${testId}/sessions/${session.id}/results`, {
        method: "POST",
        body: JSON.stringify({ results }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save these marks.");
    } finally {
      setSaving(false);
    }
  }

  const entered = gradable.filter((r) => marks[r.student.id]).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enter marks"
      description={`${session.batch.name} · out of ${totalMarks}`}
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || gradable.length === 0}>
            {saving ? "Saving…" : `Save ${entered} result${entered === 1 ? "" : "s"}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

        {report && gradable.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nobody was marked present for this test, so there are no marks to enter.
          </p>
        )}

        {gradable.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              Only students marked present appear here. {report!.summary.absent} absent student
              {report!.summary.absent === 1 ? "" : "s"} excluded.
            </p>

            <div className="divide-y divide-border rounded-xl border border-border">
              {gradable.map((r) => (
                <div key={r.student.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.student.name}</p>
                    <p className="text-xs text-muted-foreground">{r.student.studentCode}</p>
                  </div>
                  {r.attendanceStatus === "LATE" && <Badge tone="warning">Late</Badge>}
                  <div className="w-24 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max={totalMarks}
                      step="0.5"
                      inputMode="decimal"
                      placeholder="—"
                      value={marks[r.student.id] ?? ""}
                      onChange={(e) => setMarks((prev) => ({ ...prev, [r.student.id]: e.target.value }))}
                      className="text-right"
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
