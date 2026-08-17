"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CreateSalaryProfilePayload, SalaryType, UnconfiguredStaffUser } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /// Pre-fills the "existing staff member" case when opened from that row's
  /// "Set up salary" action; null opens straight into "external staff" mode.
  presetUser: UnconfiguredStaffUser | null;
}

export function AddSalaryProfileModal({ open, onClose, onSaved, presetUser }: Props) {
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [title, setTitle] = useState("");
  const [salaryType, setSalaryType] = useState<SalaryType>("FIXED");
  const [monthlyRate, setMonthlyRate] = useState("");
  const [perLectureRate, setPerLectureRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isExternal = !presetUser;

  useEffect(() => {
    if (!open) return;
    setExternalName("");
    setExternalEmail("");
    setExternalPhone("");
    setTitle("");
    setSalaryType("FIXED");
    setMonthlyRate("");
    setPerLectureRate("");
    setError(null);
  }, [open, presetUser]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload: CreateSalaryProfilePayload = {
      userId: presetUser?.id,
      externalName: isExternal ? externalName : undefined,
      externalEmail: isExternal && externalEmail ? externalEmail : undefined,
      externalPhone: isExternal && externalPhone ? externalPhone : undefined,
      title: title || undefined,
      salaryType,
      monthlyRate: salaryType === "FIXED" ? Number(monthlyRate) : undefined,
      perLectureRate: salaryType === "PER_LECTURE" ? Number(perLectureRate) : undefined,
    };

    try {
      await apiFetch("/payroll/staff", { method: "POST", body: JSON.stringify(payload) });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not set up this salary profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={presetUser ? `Set up salary — ${presetUser.fullName}` : "Add external staff"}
      description={isExternal ? "For people paid by the institute who don't have a platform login — a caretaker, housekeeping, etc." : undefined}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-salary-profile-form" disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="add-salary-profile-form" onSubmit={handleSubmit} className="space-y-4">
        {isExternal && (
          <>
            <Input label="Name" required value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="e.g. Ramesh Yadav" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Email (optional)"
                type="email"
                value={externalEmail}
                onChange={(e) => setExternalEmail(e.target.value)}
                placeholder="For payment notifications"
              />
              <Input label="Phone (optional)" value={externalPhone} onChange={(e) => setExternalPhone(e.target.value)} />
            </div>
          </>
        )}
        <Input label="Title / role (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isExternal ? "e.g. Caretaker" : "Overrides the platform role, e.g. Senior Faculty — Physics"} />

        <div className="flex gap-1.5">
          {(["FIXED", "PER_LECTURE"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSalaryType(t)}
              disabled={isExternal && t === "PER_LECTURE"}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                salaryType === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              {t === "FIXED" ? "Fixed monthly" : "Per lecture"}
            </button>
          ))}
        </div>
        {isExternal && salaryType === "PER_LECTURE" && (
          <p className="text-xs text-muted-foreground">Per-lecture pay needs lecture data, only available for platform faculty.</p>
        )}

        {salaryType === "FIXED" ? (
          <Input label="Monthly rate (₹)" type="number" min={0.01} step="0.01" required value={monthlyRate} onChange={(e) => setMonthlyRate(e.target.value)} />
        ) : (
          <Input label="Rate per lecture (₹)" type="number" min={0.01} step="0.01" required value={perLectureRate} onChange={(e) => setPerLectureRate(e.target.value)} />
        )}

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
