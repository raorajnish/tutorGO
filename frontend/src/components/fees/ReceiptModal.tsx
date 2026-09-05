"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth-context";
import { useInstituteProfile } from "@/lib/useInstituteProfile";
import { PAYMENT_MODE_LABELS, type ReceiptDetail } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";
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
  const profile = useInstituteProfile();
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
    <Modal open={paymentId !== null} onClose={onClose} title="Receipt" width="lg">
      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      {!receipt && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {receipt && (
        <div className="space-y-5">
          <div id="receipt-print-area">
            <DocumentSheet statusBadge={receipt.voided && <DocumentStamp label="Void" />}>
              <div className="flex items-start justify-between gap-4">
                <DocumentLetterhead
                  name={instituteName}
                  address={[profile?.address, [profile?.city, profile?.state].filter(Boolean).join(", ")].filter(Boolean).join(", ") || null}
                  contact={[profile?.phone, profile?.email].filter(Boolean).join(" · ") || null}
                />
                <DocumentMeta title="Fee Receipt" reference={receipt.receiptNumber} date={fmtDate(receipt.paidOn)} />
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
                    { label: "Course", value: receipt.student.course.name },
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
                  amount: formatMoney(a.amount),
                }))}
              />

              <DocumentTotals
                rows={[
                  { label: "Amount received", value: formatMoney(receipt.amount), emphasize: true },
                  { label: "Account balance remaining", value: formatMoney(receipt.accountTotals.balance) },
                ]}
              />

              <DocumentFooter
                lines={[
                  `Recorded by ${receipt.createdByName ?? "—"} on ${fmtDate(receipt.createdAt)}`,
                  ...(receipt.voided && receipt.voidedByName ? [`Voided by ${receipt.voidedByName}`] : []),
                  "This is a computer-generated receipt and requires no signature.",
                ]}
              />
            </DocumentSheet>
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
