"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EditStudentModal } from "@/components/students/EditStudentModal";
import { SetupFeeAccountModal } from "@/components/fees/SetupFeeAccountModal";
import { formatMoney } from "@/lib/money";
import { ATTENDANCE_STATUS_LABELS, FEE_PLAN_TYPE_LABELS, type Batch, type StudentDetail } from "@/lib/types";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface Props {
  studentId: string | null;
  onClose: () => void;
  onChanged: () => void;
}

export function StudentProfileModal({ studentId, onClose, onChanged }: Props) {
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setupFeeOpen, setSetupFeeOpen] = useState(false);

  function load() {
    if (!studentId) return;
    apiFetch<StudentDetail>(`/students/${studentId}`)
      .then(setStudent)
      .catch(() => setError("Could not load this student."));
  }

  useEffect(() => {
    setStudent(null);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  async function toggleActive() {
    if (!student) return;
    setBusy(true);
    try {
      await apiFetch(`/students/${student.id}/${student.isActive ? "deactivate" : "activate"}`, { method: "POST" });
      onChanged();
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this student.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={!!studentId} onClose={onClose} title={student?.name ?? "Student"} description={student?.studentCode} width="lg">
        {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

        {student && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={student.isActive ? "success" : "danger"}>{student.isActive ? "Active" : "Inactive"}</Badge>
              <Badge tone="primary">{student.course.name} ({student.course.code})</Badge>
              <div className="ml-auto flex gap-2">
                <Button variant="secondary" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Button variant="secondary" onClick={() => setReassignOpen(true)}>
                  Change batch
                </Button>
                <Button variant={student.isActive ? "destructive" : "primary"} disabled={busy} onClick={() => (student.isActive ? setDeactivateOpen(true) : toggleActive())}>
                  {student.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoBlock label="Email" value={student.email} />
              <InfoBlock label="Phone" value={student.phone ?? "—"} />
              <InfoBlock label="Parent phone" value={student.parentPhone ?? "—"} />
              <InfoBlock label="Date of birth" value={fmtDate(student.dob)} />
              <InfoBlock label="Father's name" value={student.fatherName ?? "—"} />
              <InfoBlock label="Mother's name" value={student.motherName ?? "—"} />
              <InfoBlock label="School" value={student.school ?? "—"} />
              <InfoBlock label="Admission date" value={fmtDate(student.admissionDate)} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Batch history</p>
              <div className="divide-y divide-border rounded-xl border border-border">
                {student.batchHistory.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{h.batch.name}</p>
                      <p className="text-xs text-muted-foreground">{h.batch.course.name}</p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {fmtDate(h.joinedAt)} – {h.leftAt ? fmtDate(h.leftAt) : "Present"}
                    </div>
                  </div>
                ))}
                {student.batchHistory.length === 0 && (
                  <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">No batch assigned yet.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Fee account</p>
                {!student.feesModuleEnabled ? (
                  <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
                    Fees module not enabled yet.
                  </p>
                ) : student.feeAccount ? (
                  <div className="space-y-2 rounded-xl border border-border px-3.5 py-3 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge tone="primary">{FEE_PLAN_TYPE_LABELS[student.feeAccount.planType]}</Badge>
                      <Badge tone={student.feeAccount.status === "ACTIVE" ? "success" : "neutral"}>
                        {student.feeAccount.status === "ACTIVE" ? "Active" : "Closed"}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-foreground">
                      <span className="text-muted-foreground">Total due</span>
                      <span>{formatMoney(student.feeAccount.totalDue)}</span>
                    </div>
                    <div className="flex justify-between text-foreground">
                      <span className="text-muted-foreground">Paid</span>
                      <span>{formatMoney(student.feeAccount.totalPaid)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-foreground">
                      <span>Balance</span>
                      <span>{formatMoney(student.feeAccount.balance)}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-xl border border-dashed border-border px-3.5 py-3 text-center">
                    <p className="text-sm text-muted-foreground">No fee account set up yet.</p>
                    <Button variant="secondary" onClick={() => setSetupFeeOpen(true)}>
                      Set up fee account
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">Recent attendance</p>
                {!student.attendanceModuleEnabled ? (
                  <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
                    Attendance module not enabled yet.
                  </p>
                ) : student.recentAttendance.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted-foreground">
                    No attendance recorded yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border rounded-xl border border-border">
                    {student.recentAttendance.map((r) => (
                      <div key={r.lectureId} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{r.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.batch} · {fmtDate(r.date)}
                          </p>
                        </div>
                        <Badge tone={ATTENDANCE_STATUS_TONE[r.status]}>{ATTENDANCE_STATUS_LABELS[r.status]}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {student && (
        <SetupFeeAccountModal
          open={setupFeeOpen}
          onClose={() => setSetupFeeOpen(false)}
          onSaved={load}
          student={student}
        />
      )}

      {student && (
        <EditStudentModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          student={student}
          onSaved={() => {
            onChanged();
            load();
          }}
        />
      )}

      {student && (
        <ReassignBatchModal
          open={reassignOpen}
          onClose={() => setReassignOpen(false)}
          studentId={student.id}
          courseId={student.course.id}
          onReassigned={() => {
            onChanged();
            load();
          }}
        />
      )}

      <ConfirmModal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        onConfirm={toggleActive}
        title={`Deactivate ${student?.name ?? "this student"}?`}
        description="Their current batch enrollment will be closed. This doesn't delete their record — you can reactivate any time."
        confirmLabel="Deactivate"
      />
    </>
  );
}

const ATTENDANCE_STATUS_TONE = {
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  LEAVE: "neutral",
  HOLIDAY: "primary",
  PRESENT_BIOMETRIC: "success",
} as const;

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ReassignBatchModal({
  open,
  onClose,
  studentId,
  courseId,
  onReassigned,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  courseId: string;
  onReassigned: () => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBatchId("");
    setError(null);
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [open, courseId]);

  async function handleSubmit() {
    if (!batchId) {
      setError("Select a batch.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/students/${studentId}/reassign-batch`, { method: "POST", body: JSON.stringify({ batchId }) });
      onReassigned();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reassign this student's batch.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change batch"
      description="Closes the current enrollment and opens a new one — history is kept."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Change batch"}
          </Button>
        </>
      }
    >
      <Dropdown
        label="New batch"
        value={batchId}
        onChange={setBatchId}
        options={batches.map((b) => ({ value: b.id, label: b.name }))}
        placeholder="Select batch…"
      />
      {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
    </Modal>
  );
}
