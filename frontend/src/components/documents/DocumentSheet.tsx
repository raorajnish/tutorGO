import type { ReactNode } from "react";

/**
 * Shared letterhead/layout for every printable financial document (fee
 * receipts, payslips) — one component so both actually look like they came
 * from the same institute rather than each screen inventing its own take on
 * "receipt-shaped." Modeled on the standard invoice/receipt shape used
 * industry-wide: a letterhead, a title + reference/date meta block, an
 * itemized table, a totals block, and a footer — not a från-scratch layout
 * per document type.
 *
 * Print-first: `.tg-doc` sizes itself like a sheet of paper on screen (a
 * card with real margins) and un-does that on `print:` so what comes out of
 * the printer is the sheet itself, not a card floating on a page.
 */
export function DocumentSheet({
  accent = "primary",
  statusBadge,
  children,
}: {
  /** Sets the thin top accent bar and the letterhead's ink — "primary" for
   * receipts (money coming in), "accent" for payslips (money going out),
   * keeping the two visually distinct at a glance even printed in black and
   * white where color barely survives. */
  accent?: "primary" | "accent";
  /** e.g. a VOID or DRAFT stamp — rendered top-right, not full-width, the
   * way a real stamped document marks itself rather than banner-alerting. */
  statusBadge?: ReactNode;
  children: ReactNode;
}) {
  const accentVar = accent === "accent" ? "var(--accent)" : "var(--primary)";
  return (
    <div
      className="tg-doc relative mx-auto w-full max-w-[640px] overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-card) print:max-w-none print:rounded-none print:border-0 print:shadow-none"
      style={{ "--doc-accent": accentVar } as React.CSSProperties}
    >
      <div className="h-1.5 w-full" style={{ background: "var(--doc-accent)" }} />
      <div className="space-y-6 p-7 sm:p-9 print:p-0">
        {/* Rendered in normal flow, right-aligned, above the letterhead —
            not absolutely positioned over it. An absolutely-positioned
            stamp collided with the meta block's title text in testing
            (both anchor to the same top-right corner); flow layout can't
            collide with anything, regardless of how tall a given
            document's header ends up being. */}
        {statusBadge && <div className="flex justify-end">{statusBadge}</div>}
        {children}
      </div>
    </div>
  );
}

export function DocumentLetterhead({
  name,
  address,
  contact,
  logoLetter,
}: {
  name: string;
  address?: string | null;
  contact?: string | null;
  /** Falls back to the institute's own initial — every other letterhead in
   * this app (sidebar, avatars) already uses an initial mark rather than
   * requiring an actual uploaded logo, so this stays consistent rather than
   * showing a blank slot when no logo exists. */
  logoLetter?: string;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <div
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-white"
        style={{ background: "var(--doc-accent)" }}
        aria-hidden="true"
      >
        {(logoLetter ?? name.charAt(0)).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="font-display truncate text-lg font-bold leading-tight text-foreground">{name}</p>
        {address && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{address}</p>}
        {contact && <p className="text-xs leading-snug text-muted-foreground">{contact}</p>}
      </div>
    </div>
  );
}

/** The right-aligned "what this document is" block every invoice/receipt
 * has next to its letterhead — title, reference number, date. */
export function DocumentMeta({
  title,
  reference,
  date,
}: {
  title: string;
  reference: string;
  date: string;
}) {
  return (
    <div className="shrink-0 text-right">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</p>
      <p className="font-display mt-0.5 text-lg font-bold tabular-nums text-foreground">{reference}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{date}</p>
    </div>
  );
}

export function DocumentDivider() {
  return <div className="h-px bg-border" />;
}

/** Two-column "who this is for / who paid for what" block — the receipt's
 * student, the payslip's staff member. Label/value pairs stacked, not an
 * inline table, so long values (a full name + code) never truncate awkwardly
 * next to a short label the way a flex-justify-between row can. */
export function DocumentPartyBlock({ label, rows }: { label: string; rows: { label: string; value: ReactNode }[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="mt-1.5 space-y-0.5">
        {rows.map((r) => (
          <p key={r.label} className="text-sm">
            <span className="text-muted-foreground">{r.label}: </span>
            <span className="font-medium text-foreground">{r.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export interface DocumentLineItem {
  label: string;
  sublabel?: string;
  amount: string;
  /** Small trailing tag, e.g. "Paid" / "Partial · ₹500 paid" — optional so a
   * receipt (which has no per-line status) doesn't render an empty slot. */
  tag?: ReactNode;
}

/** The itemized table both documents share — a receipt's installment
 * allocations, a payslip's earning lines. Real `<table>` markup, not
 * flex rows: it's what makes the header repeat correctly if a payslip's
 * line items ever spill onto a second printed page. */
export function DocumentItemTable({ items, columnLabel = "Description" }: { items: DocumentLineItem[]; columnLabel?: string }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <th className="pb-2 font-semibold">{columnLabel}</th>
          <th className="pb-2 text-right font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} className="border-b border-border/60 last:border-0">
            <td className="py-2.5 pr-3">
              <span className="text-foreground">{item.label}</span>
              {item.sublabel && <span className="block text-xs text-muted-foreground">{item.sublabel}</span>}
            </td>
            <td className="py-2.5 text-right align-top">
              <span className="tabular-nums font-medium text-foreground">{item.amount}</span>
              {item.tag && <span className="mt-1 block text-right">{item.tag}</span>}
            </td>
          </tr>
        ))}
        {items.length === 0 && (
          <tr>
            <td colSpan={2} className="py-6 text-center text-sm text-muted-foreground">
              Nothing to show.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** The totals block under the item table — a plain row for each subtotal,
 * the last one (`emphasize`) rendered bigger and bolder as the actual bottom
 * line, exactly where a reader's eye goes looking for it. */
export function DocumentTotals({ rows }: { rows: { label: string; value: string; emphasize?: boolean }[] }) {
  return (
    <div className="ml-auto w-full max-w-[260px] space-y-1.5">
      {rows.map((r, i) => (
        <div
          key={i}
          className={`flex items-center justify-between ${r.emphasize ? "border-t border-border pt-2 text-base font-bold text-foreground" : "text-sm text-muted-foreground"}`}
        >
          <span className={r.emphasize ? "text-foreground" : ""}>{r.label}</span>
          <span className={`tabular-nums ${r.emphasize ? "text-foreground" : "font-medium text-foreground"}`}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DocumentFooter({ lines }: { lines: string[] }) {
  return (
    <div className="space-y-0.5 border-t border-dashed border-border pt-4 text-center">
      {lines.map((l, i) => (
        <p key={i} className={i === lines.length - 1 ? "text-[11px] text-muted-foreground" : "text-xs text-muted-foreground"}>
          {l}
        </p>
      ))}
    </div>
  );
}

/** A stamp-style badge for VOID/DRAFT states — rotated slightly, bordered,
 * reads as a physical stamp rather than a status pill, which is the
 * convention real printed receipts use for exactly this. */
export function DocumentStamp({ label, tone = "danger" }: { label: string; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "var(--danger)" : "var(--warning)";
  return (
    <div
      className="-rotate-6 rounded-md border-2 px-2.5 py-1 text-xs font-bold uppercase tracking-widest"
      style={{ borderColor: color, color }}
    >
      {label}
    </div>
  );
}
