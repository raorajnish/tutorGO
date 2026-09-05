"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { UpiQr } from "@/components/ui/UpiQr";
import { buildUpiUri } from "@/lib/upi";
import type { InstitutePaymentConfig } from "@/lib/types";

/**
 * Settings → Payments (changes-phase11.md §11.1, §13.1). Off by default:
 * students only ever see a "Pay fees" button once an owner/admin turns this
 * on, and the server refuses to enable it without a UPI ID — an empty sheet
 * would be worse than no feature at all.
 *
 * There is no QR upload any more: the QR students scan is generated from the
 * UPI ID below, so it can't outlive a changed UPI ID the way an uploaded
 * image silently could. The preview here is the real thing, rendered by the
 * same component the portal uses.
 */
export function PaymentsSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [instructions, setInstructions] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<InstitutePaymentConfig | null>("/org/payment-config")
      .then((cfg) => {
        if (!cfg) return;
        setIsEnabled(cfg.isEnabled);
        setUpiId(cfg.upiId ?? "");
        setPayeeName(cfg.payeeName ?? "");
        setInstructions(cfg.instructions ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const cfg = await apiFetch<InstitutePaymentConfig>("/org/payment-config", {
        method: "PUT",
        body: JSON.stringify({
          isEnabled,
          upiId: upiId.trim() || null,
          payeeName: payeeName.trim() || null,
          instructions: instructions.trim() || null,
        }),
      });
      setIsEnabled(cfg.isEnabled);
      setSuccess("Payment settings saved.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save payment settings.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const trimmedUpi = upiId.trim();
  const canEnable = Boolean(trimmedUpi);
  // Previewed without an amount — that's the open-amount QR, since what a
  // student owes differs per student. The portal adds `am=` per payment.
  const previewUri = trimmedUpi ? buildUpiUri({ upiId: trimmedUpi, payeeName: payeeName.trim() }) : null;

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Accept UPI payments in the portal</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Students see a &quot;Pay fees&quot; button, your UPI details and a QR generated from them, and can upload
            proof of payment for you to review.
          </p>
        </div>
        <Toggle checked={isEnabled} onChange={setIsEnabled} disabled={!canEnable && !isEnabled} label="Enable UPI payments" />
      </div>

      {!canEnable && (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          Add a UPI ID below before turning this on — the QR students scan is generated from it.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="UPI ID" placeholder="institute@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
        <Input
          label="Payee name (optional)"
          placeholder="Shown to students alongside the UPI ID"
          value={payeeName}
          onChange={(e) => setPayeeName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">QR code</p>
        {previewUri ? (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
            <UpiQr value={previewUri} size={128} downloadName="payment-qr" className="shrink-0" />
            <div className="min-w-0 flex-1 text-xs text-muted-foreground">
              <p className="text-sm font-medium text-foreground">Generated automatically</p>
              <p className="mt-1">
                This is exactly what students scan. It updates itself if you change the UPI ID — download it to print
                or share on WhatsApp.
              </p>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
            Enter a UPI ID above to generate the QR.
          </p>
        )}
      </div>

      <Textarea
        label="Instructions shown to students (optional)"
        placeholder="e.g. Include your student code in the payment note."
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        maxLength={500}
        rows={3}
      />

      {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
      {success && <p className="rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">{success}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
