"use client";

import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { FeePayment } from "@/lib/types";

interface Props {
  payment: FeePayment | null;
  onClose: () => void;
  onVoided: () => void;
}

export function VoidPaymentModal({ payment, onClose, onVoided }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!payment) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/fees/payments/${payment.id}/void`, { method: "POST", body: JSON.stringify({ reason }) });
      setReason("");
      onVoided();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not void this payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={payment !== null}
      onClose={onClose}
      title="Void payment"
      description={payment ? `${payment.receiptNumber} — reverses the balance, keeps the record for audit.` : undefined}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting || !reason.trim()}>
            {submitting ? "Voiding…" : "Void payment"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Textarea
          label="Reason"
          required
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. entered against the wrong installment"
        />
        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </div>
    </Modal>
  );
}
