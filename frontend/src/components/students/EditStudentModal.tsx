"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { StudentDetail } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  student: StudentDetail;
  onSaved: () => void;
}

function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function EditStudentModal({ open, onClose, student, onSaved }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [dob, setDob] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [school, setSchool] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(student.name);
    setEmail(student.email);
    setPhone(student.phone ?? "");
    setParentPhone(student.parentPhone ?? "");
    setDob(toDateInput(student.dob));
    setFatherName(student.fatherName ?? "");
    setMotherName(student.motherName ?? "");
    setSchool(student.school ?? "");
    setError(null);
  }, [open, student]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      email,
      phone: phone || null,
      parentPhone: parentPhone || null,
      dob: dob || null,
      fatherName: fatherName || null,
      motherName: motherName || null,
      school: school || null,
    };

    try {
      await apiFetch(`/students/${student.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save this student's details.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit ${student.name}`}
      description="Course and student code are structural and can't be changed here."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="edit-student-form" disabled={submitting}>
            {submitting ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="edit-student-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Student name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Parent phone" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
        </div>

        <Input label="Date of birth" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Father's name" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
          <Input label="Mother's name" value={motherName} onChange={(e) => setMotherName(e.target.value)} />
        </div>

        <Input label="School" value={school} onChange={(e) => setSchool(e.target.value)} />

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
