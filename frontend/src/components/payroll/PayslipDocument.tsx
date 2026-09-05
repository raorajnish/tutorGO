"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { useInstituteProfile } from "@/lib/useInstituteProfile";
import { formatMoney } from "@/lib/money";
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
import type { PayrollLedger, PayrollPeriodGroup } from "@/lib/types";

/**
 * A real payslip document — there wasn't one before this (changes-phase12.md
 * follow-up): the only prior "payslip" was a WhatsApp-style text message
 * confirming a single payment, not a period's earnings. This documents one
 * `PayrollPeriodGroup` — the same per-period earning lines the ledger already
 * shows expanded, just laid out as a real payslip rather than a table row —
 * built entirely from data the ledger already loaded, so no new endpoint.
 */
export function PayslipDocument({
  ledger,
  period,
  onClose,
}: {
  ledger: PayrollLedger | null;
  period: PayrollPeriodGroup | null;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const profile = useInstituteProfile();
  const [copied, setCopied] = useState(false);
  const instituteName = user?.institute?.name ?? "TutorGO";

  const outstanding = period ? Number(period.totalOutstanding) : 0;
  const status = outstanding <= 0 ? "Paid" : Number(period?.totalPaid ?? 0) > 0 ? "Partially paid" : "Unpaid";

  async function handleShare() {
    if (!period || !ledger) return;
    const lines = [
      `*${instituteName}*`,
      `Payslip — ${period.label}`,
      "",
      `Name: ${ledger.name}`,
      ...(ledger.title ? [`Designation: ${ledger.title}`] : []),
      "",
      "Earnings:",
      ...period.lineItems.map((i) => `  ${i.label} — ${formatMoney(i.amount)}`),
      "",
      `Gross earned: ${formatMoney(period.totalAmount)}`,
      `Paid: ${formatMoney(period.totalPaid)}`,
      `Outstanding: ${formatMoney(period.totalOutstanding)}`,
      "",
      `Status: ${status}`,
    ];
    const text = lines.join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: `Payslip — ${period.label}`, text });
        return;
      } catch {
        // Cancelled — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the document is still fully visible.
    }
  }

  return (
    <Modal open={!!period} onClose={onClose} title="Payslip" width="lg">
      {period && ledger && (
        <div className="space-y-5">
          <div id="payslip-print-area">
            <DocumentSheet
              accent="accent"
              statusBadge={outstanding > 0 && <DocumentStamp label={status} tone="warning" />}
            >
              <div className="flex items-start justify-between gap-4">
                <DocumentLetterhead
                  name={instituteName}
                  address={[profile?.address, [profile?.city, profile?.state].filter(Boolean).join(", ")].filter(Boolean).join(", ") || null}
                  contact={[profile?.phone, profile?.email].filter(Boolean).join(" · ") || null}
                />
                <DocumentMeta title="Payslip" reference={period.label} date={`Generated ${new Date().toLocaleDateString("en-IN")}`} />
              </div>

              <DocumentDivider />

              <div className="grid gap-5 sm:grid-cols-2">
                <DocumentPartyBlock
                  label="Paid to"
                  rows={[
                    { label: "Name", value: ledger.name ?? "—" },
                    ...(ledger.title ? [{ label: "Designation", value: ledger.title }] : []),
                  ]}
                />
                <DocumentPartyBlock
                  label="Pay structure"
                  rows={[
                    {
                      label: ledger.salaryType === "PER_LECTURE" ? "Rate per lecture" : "Monthly rate",
                      value: formatMoney((ledger.salaryType === "PER_LECTURE" ? ledger.perLectureRate : ledger.monthlyRate) ?? "0"),
                    },
                  ]}
                />
              </div>

              <DocumentItemTable
                columnLabel="Earnings"
                items={period.lineItems.map((item) => ({
                  label: item.label,
                  amount: formatMoney(item.amount),
                  tag:
                    item.status === "PAID" ? (
                      <span className="text-xs font-medium text-success">Paid</span>
                    ) : item.status === "PARTIAL" ? (
                      <span className="text-xs font-medium text-warning">{formatMoney(item.paidAmount)} paid</span>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">Unpaid</span>
                    ),
                }))}
              />

              <DocumentTotals
                rows={[
                  { label: "Gross earnings", value: formatMoney(period.totalAmount) },
                  { label: "Amount paid", value: formatMoney(period.totalPaid) },
                  { label: "Net payable", value: formatMoney(period.totalOutstanding), emphasize: true },
                ]}
              />

              <DocumentFooter
                lines={[
                  outstanding <= 0
                    ? "This period has been paid in full."
                    : `${formatMoney(outstanding)} remains outstanding for this period.`,
                  "This is a computer-generated payslip and requires no signature.",
                ]}
              />
            </DocumentSheet>
          </div>

          <div className="flex justify-center gap-3 print:hidden">
            <button
              type="button"
              onClick={handleShare}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                copied ? "bg-success-soft text-success" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
              }`}
            >
              {copied ? "Copied!" : "Share"}
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
    </Modal>
  );
}
