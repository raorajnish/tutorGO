"use client";

import { useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { todayInput } from "@/lib/format";

/** No app-shell on purpose — this directory has no layout.tsx, so it falls
 * through to the bare root layout, same as /login. This is the one screen
 * students/parents use directly rather than staff, so it's built standalone:
 * no sidebar, minimal JS, single column, large touch targets. See
 * changes-phase8.md §8f. */

interface LookupResult {
  id: string;
  name: string;
  course: { name: string; code: string } | null;
  email: string;
  phone: string;
  parentPhone: string;
  dob: string | null;
  fatherName: string;
  motherName: string;
  school: string;
}

export default function AdmissionFormPage() {
  const [step, setStep] = useState<"identify" | "form" | "done">("identify");
  const [studentCode, setStudentCode] = useState("");
  const [pin, setPin] = useState("");
  const [student, setStudent] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [dob, setDob] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [school, setSchool] = useState("");

  async function handleIdentify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<LookupResult>("/public/students/lookup", {
        method: "POST",
        body: JSON.stringify({ studentCode: studentCode.trim(), pin: pin.trim() }),
      });
      setStudent(result);
      setEmail(result.email);
      setPhone(result.phone);
      setParentPhone(result.parentPhone);
      setDob(result.dob ? result.dob.slice(0, 10) : "");
      setFatherName(result.fatherName);
      setMotherName(result.motherName);
      setSchool(result.school);
      setStep("form");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitProfile(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/public/students/complete-profile", {
        method: "POST",
        body: JSON.stringify({
          studentCode: studentCode.trim(),
          pin: pin.trim(),
          email: email.trim() || undefined,
          phone: phone.trim(),
          parentPhone: parentPhone.trim() || undefined,
          dob: dob || undefined,
          fatherName: fatherName.trim() || undefined,
          motherName: motherName.trim() || undefined,
          school: school.trim() || undefined,
        }),
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background px-4 py-10 sm:items-center">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-foreground">Admission Form</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "identify" && "Enter your Student ID and the 4-digit code from your handout sheet."}
            {step === "form" && student && `Hi ${student.name}${student.course ? ` — ${student.course.name}` : ""}. Fill in your details below.`}
            {step === "done" && "All set!"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          {step === "identify" && (
            <form onSubmit={handleIdentify} className="space-y-4">
              <Input
                label="Student ID"
                required
                autoFocus
                value={studentCode}
                onChange={(e) => setStudentCode(e.target.value)}
                placeholder="e.g. SP20-25-10-0007"
                autoCapitalize="characters"
              />
              <Input
                label="4-digit code"
                required
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
              />
              {error && (
                <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>
              )}
              <Button type="submit" disabled={submitting || !studentCode.trim() || pin.trim().length !== 4} className="w-full">
                {submitting ? "Checking…" : "Continue"}
              </Button>
            </form>
          )}

          {step === "form" && (
            <form onSubmit={handleSubmitProfile} className="space-y-4">
              <Input label="Your phone number" required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input label="Parent's phone (optional)" type="tel" inputMode="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
              <Input label="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="Date of birth (optional)" type="date" max={todayInput()} value={dob} onChange={(e) => setDob(e.target.value)} />
              <Input label="Father's name (optional)" value={fatherName} onChange={(e) => setFatherName(e.target.value)} />
              <Input label="Mother's name (optional)" value={motherName} onChange={(e) => setMotherName(e.target.value)} />
              <Input label="School (optional)" value={school} onChange={(e) => setSchool(e.target.value)} />

              {error && (
                <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>
              )}
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            </form>
          )}

          {step === "done" && (
            <div className="space-y-4 text-center">
              <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-3 text-sm text-success">
                Your details have been saved. If you spot a mistake later, contact reception to fix it.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
