"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiFetch, apiUpload, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import type { InstitutePaymentConfig } from "@/lib/types";

/**
 * Settings → Payments (changes-phase11.md §11.1). Off by default: students
 * only ever see a "Pay fees" button once an owner/admin turns this on, and
 * the server itself refuses to enable it with no UPI ID and no QR — an empty
 * sheet would be worse than no feature at all.
 */
export function PaymentsSettingsTab() {
  const [loading, setLoading] = useState(true);
  const [isEnabled, setIsEnabled] = useState(false);
  const [upiId, setUpiId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [qrAssetUrl, setQrAssetUrl] = useState<string | null>(null);
  const [qrAssetName, setQrAssetName] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiFetch<InstitutePaymentConfig | null>("/org/payment-config")
      .then((cfg) => {
        if (!cfg) return;
        setIsEnabled(cfg.isEnabled);
        setUpiId(cfg.upiId ?? "");
        setPayeeName(cfg.payeeName ?? "");
        setInstructions(cfg.instructions ?? "");
        setQrAssetUrl(cfg.qrAssetUrl);
        setQrAssetName(cfg.qrAssetName);
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

  async function handleQrSelected(file: File) {
    setError(null);
    setUploadingQr(true);
    try {
      const result = await apiUpload<{ qrAssetUrl: string; qrAssetName: string }>("/org/payment-config/qr", file);
      setQrAssetUrl(result.qrAssetUrl);
      setQrAssetName(result.qrAssetName);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not upload the QR code.");
    } finally {
      setUploadingQr(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveQr() {
    setError(null);
    try {
      await apiFetch("/org/payment-config/qr", { method: "DELETE" });
      setQrAssetUrl(null);
      setQrAssetName(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not remove the QR code.");
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const canEnable = Boolean(upiId.trim() || qrAssetUrl);

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Accept UPI payments in the portal</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Students see a &quot;Pay fees&quot; button, your UPI details and QR, and can upload proof of payment for
            you to review.
          </p>
        </div>
        <Toggle checked={isEnabled} onChange={setIsEnabled} disabled={!canEnable && !isEnabled} label="Enable UPI payments" />
      </div>

      {!canEnable && (
        <p className="rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
          Add a UPI ID or upload a QR code below before turning this on.
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
        <p className="text-sm font-medium text-foreground">QR code (optional)</p>
        {qrAssetUrl ? (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrAssetUrl} alt="Payment QR code" className="h-20 w-20 rounded-lg border border-border object-contain" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{qrAssetName}</p>
              <button type="button" onClick={handleRemoveQr} className="mt-1 text-xs text-danger hover:underline">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-muted px-4 py-6 text-sm text-muted-foreground hover:bg-secondary">
            {uploadingQr ? "Uploading…" : "Click to upload a QR code image"}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={uploadingQr}
              onChange={(e) => e.target.files?.[0] && handleQrSelected(e.target.files[0])}
            />
          </label>
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
