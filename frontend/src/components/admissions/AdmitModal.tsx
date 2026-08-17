"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import type { AdmitStudentPayload, Batch, Course, Enquiry } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdmitted: () => void;
  courses: Course[];
  enquiry: Enquiry | null;
}

const todayInput = () => new Date().toISOString().slice(0, 10);

export function AdmitModal({ open, onClose, onAdmitted, courses, enquiry }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [courseId, setCourseId] = useState("");
  const [dob, setDob] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [school, setSchool] = useState("");
  const [admissionDate, setAdmissionDate] = useState(todayInput());
  const [batchId, setBatchId] = useState("");
  const [fingerprintId, setFingerprintId] = useState("");

  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(enquiry?.name ?? "");
    setEmail("");
    setPhone(enquiry?.phone ?? "");
    setParentPhone("");
    setCourseId(enquiry?.course?.id ?? "");
    setDob("");
    setFatherName("");
    setMotherName("");
    setSchool("");
    setAdmissionDate(todayInput());
    setBatchId("");
    setFingerprintId("");
    setError(null);
  }, [open, enquiry]);

  useEffect(() => {
    if (!courseId) {
      setBatches([]);
      setBatchesLoading(false);
      return;
    }
    setBatchesLoading(true);
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then(setBatches)
      .catch(() => setBatches([]))
      .finally(() => setBatchesLoading(false));
    setBatchId("");
  }, [courseId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!courseId) {
      setError("Select a course.");
      return;
    }
    if (!batchId) {
      setError(batches.length === 0 ? "This course has no batches yet — create one first." : "Select a batch.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload: AdmitStudentPayload = {
      enquiryId: enquiry?.id,
      name,
      email: email || undefined,
      phone,
      parentPhone: parentPhone || undefined,
      courseId,
      dob: dob || undefined,
      fatherName: fatherName || undefined,
      motherName: motherName || undefined,
      school: school || undefined,
      admissionDate,
      batchId,
      fingerprintId: fingerprintId || undefined,
    };

    try {
      await apiFetch("/admissions", { method: "POST", body: JSON.stringify(payload) });
      onAdmitted();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not admit this student.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={enquiry ? `Admit ${enquiry.name}` : "Admit student"}
      description={enquiry ? "Pre-filled from the enquiry — the lead will be marked converted on submit." : "Create a new student record directly."}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="admit-form" disabled={submitting}>
            {submitting ? "Admitting…" : "Admit student"}
          </Button>
        </>
      }
    >
      <form id="admit-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Student name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Falls back to a generated address" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Phone" required value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Parent phone (optional)" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Dropdown
            label="Course (class/standard)"
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
            placeholder={
              !courseId
                ? "Select a course first"
                : batchesLoading
                  ? "Loading batches…"
                  : batches.length
                    ? "Select batch…"
                    : "No batches for this course"
            }
            disabled={!courseId || batchesLoading || batches.length === 0}
          />
        </div>
        {courseId && !batchesLoading && batches.length === 0 && (
          <p className="-mt-2 text-xs text-warning">
            This course has no batches yet. Create one on the Academics page before admitting into it.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Date of birth (optional)" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
          <Input label="Admission date" type="date" required value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Father's name (optional)" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          <Input label="Mother's name (optional)" value={motherName} onChange={(e) => setMotherName(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="School (optional)" value={school} onChange={(e) => setSchool(e.target.value)} />
          <Input label="Fingerprint ID (optional)" value={fingerprintId} onChange={(e) => setFingerprintId(e.target.value)} />
        </div>

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
