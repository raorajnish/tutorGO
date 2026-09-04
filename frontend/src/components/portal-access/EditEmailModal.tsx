"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { PortalAccessStudent } from "@/lib/types";

/** Changing the email is the fix for the two problems staff actually hit: a
 * typo at admission, and a student who no longer uses that address. When a
 * login already exists the server moves both records in one transaction, so
 * the address they sign in with is always the one shown here. */
export function EditEmailModal({
  student,
  onClose,
  onSaved,
}: {
  student: PortalAccessStudent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEmail(student?.email ?? "");
    setError(null);
  }, [student]);

  async function handleSave() {
    if (!student) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/portal-access/students/${student.id}/email`, {
        method: "PATCH",
        body: JSON.stringify({ email: email.trim() }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the email.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={student !== null}
      onClose={onClose}
      title="Change email"
      description={student ? `${student.name} signs in with this address.` : undefined}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !email.trim() || email.trim() === student?.email}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Email address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="student@example.com"
          autoFocus
        />
        {student?.hasLogin && (
          <p className="text-xs text-muted-foreground">
            This student already has a login — their sign-in email changes too. Their password is unaffected.
          </p>
        )}
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
