"use client";

import { use as usePromise, useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import {
  DocumentSheet,
  DocumentLetterhead,
  DocumentMeta,
  DocumentDivider,
  DocumentPartyBlock,
  DocumentItemTable,
  DocumentTotals,
  DocumentFooter,
  DocumentStamp,
} from "@/components/documents/DocumentSheet";
import { PAYMENT_MODE_LABELS, type PublicReceipt } from "@/lib/types";

/** No app-shell on purpose — same reasoning as /admission-form: this
 * directory has no layout.tsx, so it falls through to the bare root layout.
 * The one screen a parent opens directly, often from a WhatsApp/SMS link on
 * a phone, so it's built standalone and print-first — see changes-phase10.md
 * §10.3. Unauthenticated: GET /public/receipts/:token is the whole auth
 * model, same as the token itself being the credential. */

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function PublicReceiptPage({ params }: PageProps) {
  const { token } = usePromise(params);
  const [receipt, setReceipt] = useState<PublicReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");

  useEffect(() => {
    apiFetch<PublicReceipt>(`/public/receipts/${token}`)
      .then(setReceipt)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this receipt."));
  }, [token]);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: receipt ? `Receipt ${receipt.receiptNumber}` : "Fee receipt", url });
        return;
      } catch {
        // Cancelled or rejected — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      // Clipboard unavailable — the link is still visible in the address bar.
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center bg-background px-4 py-10 print:min-h-0 print:py-0">
      {error && (
        <div className="w-full rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-center text-sm text-danger">
          {error}
        </div>
      )}

      {!receipt && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {receipt && (
        <div className="w-full space-y-5">
          <DocumentSheet statusBadge={receipt.voided && <DocumentStamp label="Void" />}>
            <div className="flex items-start justify-between gap-4">
              <DocumentLetterhead
                name={receipt.institute.name}
                address={receipt.institute.address}
                contact={[receipt.institute.phone, receipt.institute.email].filter(Boolean).join(" · ") || null}
              />
              <DocumentMeta title="Fee Receipt" reference={receipt.receiptNumber} date={formatDate(receipt.paidOn)} />
            </div>

            <DocumentDivider />

            {receipt.voided && receipt.voidReason && (
              <p className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">Void reason: {receipt.voidReason}</p>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <DocumentPartyBlock
                label="Received from"
                rows={[
                  { label: "Student", value: `${receipt.student.name} (${receipt.student.studentCode})` },
                  ...(receipt.student.course ? [{ label: "Course", value: receipt.student.course.name }] : []),
                ]}
              />
              <DocumentPartyBlock
                label="Payment details"
                rows={[
                  { label: "Mode", value: PAYMENT_MODE_LABELS[receipt.mode] },
                  ...(receipt.notes ? [{ label: "Notes", value: receipt.notes }] : []),
                ]}
              />
            </div>

            <DocumentItemTable
              columnLabel="Applied to"
              items={receipt.allocations.map((a) => ({
                label: `Installment #${a.installmentSeq}`,
                sublabel: `Due ${formatDate(a.dueDate)}`,
                amount: formatMoney(a.amount),
              }))}
            />

            <DocumentTotals rows={[{ label: "Amount received", value: formatMoney(receipt.amount), emphasize: true }]} />

            <DocumentFooter
              lines={[`Recorded on ${formatDate(receipt.createdAt)}`, "This is a computer-generated receipt and requires no signature."]}
            />
          </DocumentSheet>

          <div className="flex justify-center gap-3 print:hidden">
            <button
              type="button"
              onClick={handleShare}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                shareState === "copied" ? "bg-success-soft text-success" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
              }`}
            >
              {shareState === "copied" ? "Link copied!" : "Share"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/70"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
