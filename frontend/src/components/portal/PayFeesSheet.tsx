"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, apiUpload, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { compressImage } from "@/lib/compressImage";
import type { PaymentProof, PaymentProofUploadResult, PortalPaymentConfig } from "@/lib/types";

const COPY_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Detects a touch-capable device — the UPI deep link (`upi://pay?...`) only
 * does anything on a phone with a UPI app installed; showing it on desktop
 * would just be a dead button. */
function isTouchDevice() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

type Step = "details" | "uploading" | "submitted";

export function PayFeesSheet({
  open,
  onClose,
  nextDueAmount,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  /** Prefills the amount field with what's actually due next — the student
   * can still change it if they're paying a different amount. */
  nextDueAmount: string | null;
  onSubmitted: () => void;
}) {
  const [config, setConfig] = useState<PortalPaymentConfig | null>(null);
  const [existingProofs, setExistingProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("details");
  const [copied, setCopied] = useState(false);

  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [compressedSizeKb, setCompressedSizeKb] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setStep("details");
    setError(null);
    setFile(null);
    setPreview(null);
    setCompressedSizeKb(null);
    setReferenceNo("");
    setAmount(nextDueAmount ?? "");

    Promise.all([
      apiFetch<PortalPaymentConfig | null>("/portal/payment-config"),
      apiFetch<PaymentProof[]>("/portal/payment-proofs"),
    ])
      .then(([cfg, proofs]) => {
        setConfig(cfg);
        setExistingProofs(proofs);
        // A pending proof already exists — the server would reject a new
        // submission anyway, so land straight on that state.
        if (proofs.some((p) => p.status === "PENDING")) setStep("submitted");
      })
      .catch(() => setConfig(null))
      .finally(() => setLoading(false));
  }, [open, nextDueAmount]);

  async function handleCopyUpi() {
    if (!config?.upiId) return;
    await navigator.clipboard.writeText(config.upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleFileSelected(selected: File) {
    setError(null);
    // Compressed immediately on selection — so the student sees the actual
    // file size that will upload before they even confirm the amount, not a
    // surprise after tapping submit.
    const compressed = await compressImage(selected);
    setFile(compressed);
    setCompressedSizeKb(Math.round(compressed.size / 1024));
    setPreview(URL.createObjectURL(compressed));
  }

  async function handleSubmit() {
    if (!file || !amount || Number(amount) <= 0) return;
    setError(null);
    setBusy(true);
    setStep("uploading");
    try {
      const uploaded = await apiUpload<PaymentProofUploadResult>("/portal/payment-proofs/upload", file);
      await apiFetch("/portal/payment-proofs", {
        method: "POST",
        body: JSON.stringify({
          amountClaimed: Number(amount),
          referenceNo: referenceNo.trim() || undefined,
          assetUrl: uploaded.url,
          assetName: uploaded.name,
          assetPublicId: uploaded.publicId,
        }),
      });
      setStep("submitted");
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not submit your payment. Try again.");
      setStep("details");
    } finally {
      setBusy(false);
    }
  }

  const latestProof = existingProofs[0];
  const upiDeepLink =
    config?.upiId && isTouchDevice()
      ? `upi://pay?pa=${encodeURIComponent(config.upiId)}&pn=${encodeURIComponent(config.payeeName ?? "")}${
          amount ? `&am=${encodeURIComponent(amount)}` : ""
        }&cu=INR`
      : null;

  return (
    <Modal open={open} onClose={onClose} title="Pay fees" width="sm">
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !config ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Online payment isn&apos;t set up for your institute yet. Please contact them directly.
        </p>
      ) : step === "submitted" && latestProof?.status === "PENDING" ? (
        <div className="space-y-4 py-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-soft text-warning">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Waiting for confirmation</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your institute will review the ₹{latestProof.amountClaimed} payment you submitted and update your
              balance once it&apos;s confirmed.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-muted p-4 text-center">
            {config.qrAssetUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.qrAssetUrl} alt="Payment QR code" className="mx-auto mb-3 h-40 w-40 rounded-lg border border-border bg-card object-contain" />
            )}
            {config.upiId && (
              <button
                type="button"
                onClick={handleCopyUpi}
                className="mx-auto flex items-center gap-2 rounded-full bg-card px-3.5 py-1.5 text-sm font-medium text-foreground shadow-(--shadow-card)"
              >
                {config.upiId}
                {COPY_ICON}
                {copied && <Badge tone="success">Copied</Badge>}
              </button>
            )}
            {config.payeeName && <p className="mt-1.5 text-xs text-muted-foreground">{config.payeeName}</p>}
            {config.instructions && <p className="mt-2 text-xs text-muted-foreground">{config.instructions}</p>}
          </div>

          {upiDeepLink && (
            <a href={upiDeepLink}>
              <Button className="w-full">Open in payment app</Button>
            </a>
          )}

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold text-foreground">I&apos;ve paid — upload proof</p>
            <Input
              label="Amount you paid"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              label="UPI reference / UTR (optional)"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              maxLength={50}
            />

            {preview ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Screenshot preview" className="h-16 w-16 rounded-lg border border-border object-cover" />
                <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {compressedSizeKb !== null && <p>{compressedSizeKb} KB after compression</p>}
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                    }}
                    className="mt-1 text-danger hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-muted px-4 py-6 text-sm text-muted-foreground hover:bg-secondary">
                Tap to select a screenshot
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
                />
              </label>
            )}

            {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}

            <Button
              className="w-full"
              disabled={!file || !amount || Number(amount) <= 0 || busy}
              onClick={handleSubmit}
            >
              {step === "uploading" ? "Submitting…" : "Submit for review"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
