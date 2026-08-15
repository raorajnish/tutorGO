"use client";

import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { InviteResultPanel } from "./InviteResultPanel";
import type { InviteResult } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  organizationId: string;
  organizationName: string;
}

export function AddOwnerModal({ open, onClose, onAdded, organizationId, organizationName }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);

  function handleClose() {
    setName("");
    setEmail("");
    setPhone("");
    setError(null);
    setResult(null);
    onClose();
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) return setError("Name and email are required.");
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<InviteResult>(`/platform/organizations/${organizationId}/owner`, {
        method: "POST",
        body: JSON.stringify({ name, email, phone: phone || undefined }),
      });
      setResult(res);
      onAdded();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not add the owner.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal open={open} onClose={handleClose} title="Owner added" width="sm">
        <div className="space-y-4 text-sm">
          <InviteResultPanel label="Owner" result={result} />
          <Button className="w-full" onClick={handleClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add owner"
      description={organizationName}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Adding…" : "Add owner"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </div>
    </Modal>
  );
}
