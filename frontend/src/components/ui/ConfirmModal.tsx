"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /// Shown under the description when there's no error. Defaults to the
  /// standard destructive-action warning; override for a confirm that's
  /// reversible (e.g. changing a plan back) rather than a real delete.
  note?: string;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  note = "This action can't be undone.",
}: ConfirmModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={handleConfirm} disabled={submitting}>
            {submitting ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
      )}
      {!error && note && <p className="text-sm text-muted-foreground">{note}</p>}
    </Modal>
  );
}
