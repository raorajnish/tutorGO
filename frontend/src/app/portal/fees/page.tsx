"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { ICONS, IconChip, StaggerGrid, StaggerItem, StaggerList, PortalEmpty, PortalHeader, PortalStat, SectionTitle } from "@/components/portal/PortalPieces";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { PayFeesSheet } from "@/components/portal/PayFeesSheet";
import type { PortalFees, PortalInstallment } from "@/lib/types";

const STATUS: Record<PortalInstallment["status"], { label: string; tone: "success" | "danger" | "warning" | "neutral" }> = {
  PAID: { label: "Paid", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  PARTIAL: { label: "Part paid", tone: "warning" },
  DUE: { label: "Due", tone: "neutral" },
  WAIVED: { label: "Waived", tone: "neutral" },
};

const RECEIPT_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" strokeLinejoin="round" />
    <path d="M9 8h6M9 12h6" strokeLinecap="round" />
  </svg>
);

export default function PortalFeesPage() {
  const [data, setData] = useState<PortalFees | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  function load() {
    apiFetch<PortalFees>("/portal/fees")
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load your fees."));
  }

  useEffect(load, []);

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PortalHeader eyebrow="My learning" title="Fees" subtitle="What's paid, what's due, and every receipt." />
        {summary && summary.balance !== "0.00" && (
          <Button onClick={() => setPayOpen(true)} className="shrink-0">
            Pay fees
          </Button>
        )}
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {!data ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-28 w-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !summary ? (
        <PortalEmpty title="No fee account yet" hint="Your institute hasn't set up a fee plan for you." />
      ) : (
        <>
          <StaggerGrid className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PortalStat
              emphasis
              icon={ICONS.rupee}
              label="Balance"
              value={formatMoney(summary.balance)}
              sub={
                summary.overdueCount > 0
                  ? `${summary.overdueCount} installment${summary.overdueCount === 1 ? "" : "s"} overdue`
                  : summary.nextDueDate
                    ? `Next due ${formatDate(summary.nextDueDate, { year: false })}`
                    : "Nothing outstanding"
              }
            />
            <PortalStat icon={ICONS.rupee} label="Paid so far" value={formatMoney(summary.totalPaid)} sub="Total received" />
            <PortalStat icon={ICONS.rupee} label="Total fee" value={formatMoney(summary.totalDue)} sub={summary.planType === "RECURRING" ? "Monthly plan" : "One-time plan"} />
            <PortalStat
              icon={ICONS.clock}
              label="Next payment"
              value={summary.nextDueAmount ? formatMoney(summary.nextDueAmount) : "—"}
              sub={summary.nextDueDate ? formatDate(summary.nextDueDate) : "All settled"}
            />
          </StaggerGrid>

          {summary.overdueCount > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
              {summary.overdueCount} installment{summary.overdueCount === 1 ? " is" : "s are"} past their due date. Please
              contact your institute to clear the balance.
            </div>
          )}

          <section>
            <SectionTitle title="Installments" />
            {data.installments.length === 0 ? (
              <PortalEmpty title="No installments" />
            ) : (
              <StaggerList>
                {data.installments.map((i) => (
                  <StaggerItem
                    key={i.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-(--shadow-card)"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-semibold text-foreground">
                      {i.seq}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        Due {formatDate(i.dueDate)}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatMoney(i.paidAmount)} paid of {formatMoney(i.amount)}
                        {i.status !== "PAID" && i.status !== "WAIVED" && ` · ${formatMoney(i.outstanding)} left`}
                      </p>
                    </div>
                    <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
          </section>

          <section>
            <SectionTitle title="Payments" />
            {data.payments.length === 0 ? (
              <PortalEmpty title="No payments yet" />
            ) : (
              <StaggerList>
                {data.payments.map((p) => {
                  const row = (
                    <>
                      <IconChip>{RECEIPT_ICON}</IconChip>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{formatMoney(p.amount)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDate(p.paidOn)} · {p.mode.replace("_", " ").toLowerCase()} · #{p.receiptNumber}
                        </p>
                      </div>
                      {p.receiptToken && <span className="shrink-0 text-xs text-muted-foreground">View receipt →</span>}
                    </>
                  );

                  return (
                    <StaggerItem key={p.id}>
                      {/* The public receipt link is the same one staff share —
                          opens a printable page the student can save for
                          themselves. Absent entirely if the link was revoked. */}
                      {p.receiptToken ? (
                        <a
                          href={`/r/${p.receiptToken}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-(--shadow-card) transition-colors hover:bg-secondary"
                        >
                          {row}
                        </a>
                      ) : (
                        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-(--shadow-card)">
                          {row}
                        </div>
                      )}
                    </StaggerItem>
                  );
                })}
              </StaggerList>
            )}
          </section>
        </>
      )}

      <PayFeesSheet
        open={payOpen}
        onClose={() => setPayOpen(false)}
        nextDueAmount={summary?.nextDueAmount ?? null}
        onSubmitted={load}
      />
    </div>
  );
}
