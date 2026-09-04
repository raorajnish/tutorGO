"use client";

import { use as usePromise, useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
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
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center bg-background px-4 py-10 print:min-h-0 print:py-0">
      {error && (
        <div className="w-full rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-center text-sm text-danger">
          {error}
        </div>
      )}

      {!receipt && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {receipt && (
        <div className="w-full space-y-5">
          <div className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card) print:border-0 print:p-0 print:shadow-none">
            {receipt.voided && (
              <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-center text-sm font-semibold text-danger">
                VOID{receipt.voidReason ? ` — ${receipt.voidReason}` : ""}
              </div>
            )}

            <div className="space-y-1 border-b border-dashed border-border pb-4 text-center">
              <p className="font-display text-lg font-bold text-foreground">{receipt.institute.name}</p>
              {receipt.institute.address && <p className="text-xs text-muted-foreground">{receipt.institute.address}</p>}
              {(receipt.institute.phone || receipt.institute.email) && (
                <p className="text-xs text-muted-foreground">
                  {[receipt.institute.phone, receipt.institute.email].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fee Receipt</p>
              <p className="font-display text-xl font-bold text-foreground">{receipt.receiptNumber}</p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student</span>
                <span className="font-medium text-foreground">
                  {receipt.student.name} ({receipt.student.studentCode})
                </span>
              </div>
              {receipt.student.course && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Course</span>
                  <span className="text-foreground">{receipt.student.course.name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-foreground">{formatMoney(receipt.amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mode</span>
                <span className="text-foreground">{PAYMENT_MODE_LABELS[receipt.mode]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid on</span>
                <span className="text-foreground">{formatDate(receipt.paidOn)}</span>
              </div>
              {receipt.notes && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Notes</span>
                  <span className="text-foreground">{receipt.notes}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5 rounded-xl border border-border p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Applied to</p>
              {receipt.allocations.map((a) => (
                <div key={a.installmentSeq} className="flex justify-between">
                  <span className="text-foreground">Installment #{a.installmentSeq}</span>
                  <span className="font-medium text-foreground">{formatMoney(a.amount)}</span>
                </div>
              ))}
            </div>

            <p className="border-t border-dashed border-border pt-3 text-center text-[11px] text-muted-foreground">
              This is a computer-generated receipt.
            </p>
          </div>

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
