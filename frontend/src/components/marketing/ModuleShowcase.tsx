"use client";

import { useState } from "react";

type Tone = "success" | "warning" | "neutral" | "accent";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  neutral: "bg-secondary text-secondary-foreground",
  accent: "bg-accent/12 text-accent",
};

interface ModuleTab {
  id: string;
  label: string;
  title: string;
  description: string;
  points: string[];
  panelTitle: string;
  panelMeta: string;
  stats: { label: string; value: string; tone: Tone }[];
  rows: { primary: string; secondary: string; value: string; status: string; tone: Tone }[];
}

const MODULES: ModuleTab[] = [
  {
    id: "admissions",
    label: "Admissions",
    title: "From first enquiry to enrolled student, without re-typing anything",
    description:
      "Every lead lands in one pipeline with its own follow-up trail. Converting it creates the student, assigns the course and batch, and closes the enquiry in the same action.",
    points: [
      "New → contacted → converted → lost, with source tracking",
      "Convert an enquiry into a student without re-entering a field",
      "Bulk CSV import that validates every row before it writes one",
      "A PIN-protected self-service form students fill in themselves",
    ],
    panelTitle: "Enquiry pipeline",
    panelMeta: "This week",
    stats: [
      { label: "New enquiries", value: "48", tone: "accent" },
      { label: "Converted", value: "31", tone: "success" },
      { label: "Follow-ups due", value: "7", tone: "warning" },
    ],
    rows: [
      { primary: "Aarav Mehta", secondary: "Walk-in · JEE Advanced", value: "2 calls", status: "Converted", tone: "success" },
      { primary: "Diya Sharma", secondary: "Website · NEET Foundation", value: "1 call", status: "Contacted", tone: "warning" },
      { primary: "Kabir Nair", secondary: "Referral · Class 12 CBSE", value: "—", status: "New", tone: "neutral" },
      { primary: "Ishita Rao", secondary: "Walk-in · Class 11 PCM", value: "3 calls", status: "Converted", tone: "success" },
    ],
  },
  {
    id: "attendance",
    label: "Attendance",
    title: "Mark a full roster in seconds — or let the biometric device do it",
    description:
      "Lectures and tests share one scheduling engine, so conflicts are caught before they happen. Rosters mark in bulk, and the daily summary computes the same rate the student sees in their portal.",
    points: [
      "Schedule by batch, subject and faculty with conflict checks",
      "Present / absent / leave / holiday, marked in bulk",
      "Biometric scans posted straight in with device-key auth",
      "Tests are scheduled sessions too — invigilator, paper, marks",
    ],
    panelTitle: "Physics · Batch B2",
    panelMeta: "Today, 09:00",
    stats: [
      { label: "Present", value: "42", tone: "success" },
      { label: "Absent", value: "3", tone: "warning" },
      { label: "Rate", value: "93%", tone: "accent" },
    ],
    rows: [
      { primary: "Aarav Mehta", secondary: "Roll 14", value: "09:02", status: "Present", tone: "success" },
      { primary: "Diya Sharma", secondary: "Roll 15", value: "—", status: "Absent", tone: "warning" },
      { primary: "Kabir Nair", secondary: "Roll 16", value: "08:57", status: "Present", tone: "success" },
      { primary: "Ishita Rao", secondary: "Roll 17", value: "09:14", status: "Late", tone: "neutral" },
    ],
  },
  {
    id: "fees",
    label: "Fees",
    title: "One payment path, so two screens can never disagree",
    description:
      "Installments split automatically, receipts number gaplessly, and every rupee — manual entry or an approved payment proof — is written by the same function. Parents get a shareable receipt link.",
    points: [
      "Auto-split installments, reschedules, waivers and repricing",
      "Gapless receipt numbering with a public, revocable share link",
      "Live UPI QR generated in the browser — no image ever uploaded",
      "Students submit a proof; staff approve it into a real payment",
    ],
    panelTitle: "Collections",
    panelMeta: "September",
    stats: [
      { label: "Collected", value: "₹8.4L", tone: "success" },
      { label: "Outstanding", value: "₹1.9L", tone: "warning" },
      { label: "Defaulters", value: "12", tone: "accent" },
    ],
    rows: [
      { primary: "Aarav Mehta", secondary: "Installment 3 of 4", value: "₹18,000", status: "Paid", tone: "success" },
      { primary: "Diya Sharma", secondary: "Installment 2 of 4", value: "₹16,500", status: "Overdue", tone: "warning" },
      { primary: "Kabir Nair", secondary: "Proof submitted", value: "₹18,000", status: "In review", tone: "neutral" },
      { primary: "Ishita Rao", secondary: "Installment 4 of 4", value: "₹18,000", status: "Paid", tone: "success" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    title: "Close the cost side of the month as cleanly as the revenue side",
    description:
      "Fixed or per-lecture salary profiles, a ledger derived from what was actually taught, and a real itemised payslip — approved as one run, then settled in a single action.",
    points: [
      "Fixed monthly or per-lecture rates, including external payees",
      "Draft → approved → paid, with line items never duplicated",
      "Itemised payslips on the same document layout as receipts",
      "Expenses and income feed one combined ledger with CSV export",
    ],
    panelTitle: "Payroll run",
    panelMeta: "September · Approved",
    stats: [
      { label: "Gross", value: "₹4.6L", tone: "accent" },
      { label: "Paid", value: "₹3.9L", tone: "success" },
      { label: "Pending", value: "₹70K", tone: "warning" },
    ],
    rows: [
      { primary: "Rahul Verma", secondary: "Faculty · Per lecture", value: "48 sessions", status: "Paid", tone: "success" },
      { primary: "Sneha Iyer", secondary: "Faculty · Fixed", value: "₹62,000", status: "Paid", tone: "success" },
      { primary: "Manoj Gupta", secondary: "Reception · Fixed", value: "₹28,000", status: "Partial", tone: "warning" },
      { primary: "Anita Desai", secondary: "External · Per lecture", value: "12 sessions", status: "Unpaid", tone: "neutral" },
    ],
  },
];

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" aria-hidden="true">
      <path d="M5 12.5l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The deep-dive section: one tab per billable module, each pairing the plain
 * claim with a rendering of the screen that backs it up. Tabs are a real
 * roving-free tablist (arrow keys are overkill for four items, but the
 * aria wiring still tells a screen reader what changed).
 */
export function ModuleShowcase() {
  const [activeId, setActiveId] = useState(MODULES[0].id);
  const active = MODULES.find((m) => m.id === activeId) ?? MODULES[0];

  return (
    <div>
      {/* Tabs — a horizontally scrollable rail on mobile rather than a wrap,
          so the row never becomes two ragged lines on a narrow screen. */}
      <div
        role="tablist"
        aria-label="Modules"
        className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:justify-center sm:px-0"
      >
        {MODULES.map((m) => {
          const selected = m.id === active.id;
          return (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`module-panel-${m.id}`}
              id={`module-tab-${m.id}`}
              onClick={() => setActiveId(m.id)}
              className={`shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`module-panel-${active.id}`}
        aria-labelledby={`module-tab-${active.id}`}
        className="mt-10 grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
      >
        {/* Claim */}
        <div key={`${active.id}-copy`} className="tg-page-enter">
          <h3 className="font-display text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
            {active.title}
          </h3>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{active.description}</p>
          <ul className="mt-6 flex flex-col gap-3">
            {active.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <CheckIcon />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        {/* Evidence */}
        <div
          key={`${active.id}-panel`}
          aria-hidden="true"
          className="tg-page-enter overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-card-hover)"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
            <p className="font-display text-sm font-semibold text-foreground">{active.panelTitle}</p>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              {active.panelMeta}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 px-4 py-4 sm:gap-3 sm:px-5">
            {active.stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border p-3">
                <p className="truncate text-[10px] font-medium text-muted-foreground sm:text-xs">{s.label}</p>
                <p className="font-display mt-1 text-lg font-semibold text-foreground sm:text-xl">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-border">
            {active.rows.map((row, i) => (
              <div
                key={row.primary}
                className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
                  {row.primary.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground sm:text-sm">{row.primary}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{row.secondary}</span>
                </span>
                <span className="hidden text-xs text-muted-foreground sm:block">{row.value}</span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold sm:text-[11px] ${TONE_CLASSES[row.tone]}`}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
