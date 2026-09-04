"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import { PAYMENT_MODE_LABELS, type ReceiptDetail } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

function receiptText(receipt: ReceiptDetail, instituteName: string): string {
  const lines = [
    `*${instituteName}*`,
    `Fee Receipt — ${receipt.receiptNumber}`,
    receipt.voided ? `⚠️ VOID${receipt.voidReason ? ` — ${receipt.voidReason}` : ""}` : "",
    "",
    `Student: ${receipt.student.name} (${receipt.student.studentCode})`,
    `Course: ${receipt.student.course.name}`,
    `Amount: ${formatMoney(receipt.amount)}`,
    `Mode: ${PAYMENT_MODE_LABELS[receipt.mode]}`,
    `Paid on: ${fmtDate(receipt.paidOn)}`,
    "",
    "Applied to:",
    ...receipt.allocations.map((a) => `  Installment #${a.installmentSeq} — ${formatMoney(a.amount)}`),
    "",
    `Remaining balance: ${formatMoney(receipt.accountTotals.balance)}`,
  ];
  return lines.filter((l) => l !== "").join("\n");
}

interface Props {
  paymentId: string | null;
  onClose: () => void;
}

/** Printable/shareable client-side receipt view — no server-side PDF
 * generation, consistent with the rest of the app. Payment is linked to the
 * student via feeAccountId → FeeAccount.studentId (never through an
 * installment), so this same GET /fees/payments/:id/receipt data is exactly
 * what a future student-portal login would scope to "my receipts" — no
 * schema change needed when that pass happens. */
export function ReceiptModal({ paymentId, onClose }: Props) {
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const instituteName = user?.institute?.name ?? "TutorGO";

  function load() {
    if (!paymentId) return;
    apiFetch<ReceiptDetail>(`/fees/payments/${paymentId}/receipt`)
      .then(setReceipt)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this receipt."));
  }

  useEffect(() => {
    setReceipt(null);
    setError(null);
    setShared(false);
    setLinkCopied(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  async function handleCopyLink() {
    if (!receipt?.publicToken) return;
    const url = `${window.location.origin}/r/${receipt.publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard unavailable — nothing more to do here.
    }
  }

  async function handleRevoke() {
    if (!paymentId) return;
    if (!window.confirm("Revoke this receipt's public link? Anyone who still has it will no longer be able to open it.")) return;
    setRevoking(true);
    try {
      await apiFetch(`/fees/payments/${paymentId}/receipt/revoke`, { method: "POST" });
      load();
    } catch {
      // Best-effort — the modal just keeps showing the (still-live) link if this fails.
    } finally {
      setRevoking(false);
    }
  }

  async function handleShare() {
    if (!receipt) return;
    const text = receiptText(receipt, instituteName);
    const title = `Receipt ${receipt.receiptNumber}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        // User cancelled the share sheet, or the browser rejected it — fall
        // through to clipboard so the action still does something useful.
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — nothing more to do;
      // the receipt is still fully visible on screen for a manual copy.
    }
  }

  return (
    <Modal open={paymentId !== null} onClose={onClose} title="Receipt" width="sm">
      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      {!receipt && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {receipt && (
        <div className="space-y-5">
          <div className="space-y-5 rounded-2xl border border-border bg-card p-5 print:border-0 print:p-0" id="receipt-print-area">
            {receipt.voided && (
              <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-center text-sm font-semibold text-danger">
                VOID{receipt.voidReason ? ` — ${receipt.voidReason}` : ""}
              </div>
            )}

            <div className="space-y-1 border-b border-dashed border-border pb-4 text-center">
              <p className="font-display text-lg font-bold text-foreground">{instituteName}</p>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fee Receipt</p>
              <p className="font-display text-xl font-bold text-foreground">{receipt.receiptNumber}</p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Student</span>
                <span className="font-medium text-foreground">
                  {receipt.student.name} ({receipt.student.studentCode})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Course</span>
                <span className="text-foreground">{receipt.student.course.name}</span>
              </div>
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
                <span className="text-foreground">{fmtDate(receipt.paidOn)}</span>
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
                <div key={a.installmentId} className="flex justify-between">
                  <span className="text-foreground">Installment #{a.installmentSeq}</span>
                  <span className="font-medium text-foreground">{formatMoney(a.amount)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 rounded-xl bg-muted p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account balance (as of now)</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total due</span>
                <span className="text-foreground">{formatMoney(receipt.accountTotals.totalDue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total paid</span>
                <span className="text-foreground">{formatMoney(receipt.accountTotals.totalPaid)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span className="text-foreground">Remaining</span>
                <span className="text-foreground">{formatMoney(receipt.accountTotals.balance)}</span>
              </div>
            </div>

            <div className="space-y-0.5 border-t border-dashed border-border pt-3 text-center">
              <p className="text-xs text-muted-foreground">
                Recorded by {receipt.createdByName ?? "—"} on {fmtDate(receipt.createdAt)}
              </p>
              {receipt.voided && receipt.voidedByName && <p className="text-xs text-danger">Voided by {receipt.voidedByName}</p>}
              <p className="text-[11px] text-muted-foreground">This is a computer-generated receipt.</p>
            </div>
          </div>

          <div className="flex justify-center gap-3 print:hidden">
            <button
              type="button"
              onClick={handleShare}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                shared ? "bg-success-soft text-success" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
              }`}
            >
              {shared ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" strokeLinecap="round" />
                </svg>
              )}
              {shared ? "Copied!" : "Share"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-xl bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/70"
            >
              Print / Save as PDF
            </button>
          </div>

          {/* A permanent, standalone page the parent can (re)open, download,
              or forward themselves — distinct from the text-share above,
              which is a one-time snapshot pasted into a chat. */}
          <div className="flex flex-col items-center gap-2 border-t border-border pt-4 print:hidden">
            {receipt.publicToken ? (
              <>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                      linkCopied ? "bg-success-soft text-success" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                    }`}
                  >
                    {linkCopied ? "Link copied!" : "Copy receipt link"}
                  </button>
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={revoking}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
                  >
                    {revoking ? "Revoking…" : "Revoke link"}
                  </button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Anyone with this link can view (and print) this receipt — no login needed. It never expires unless revoked.
                </p>
              </>
            ) : (
              <p className="text-center text-xs text-muted-foreground">No public link for this receipt.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
