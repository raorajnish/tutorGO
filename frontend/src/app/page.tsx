"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { AppPreview } from "@/components/marketing/AppPreview";
import { FaqItem } from "@/components/marketing/FaqItem";
import { FeatureCard } from "@/components/marketing/FeatureCard";
import { LandingNav } from "@/components/marketing/LandingNav";
import { Logo } from "@/components/marketing/Logo";
import { ModuleShowcase } from "@/components/marketing/ModuleShowcase";
import { PhoneMock } from "@/components/marketing/PhoneMock";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import {
  AcademicsScene,
  AttendanceScene,
  CampusScene,
  EnquiryScene,
  FeesScene,
  PayrollScene,
  PortalScene,
  TenancyScene,
} from "@/components/marketing/Illustrations";

/* ----------------------------------------------------------------- Content */

const FEATURES = [
  {
    title: "Enquiry to admission",
    description:
      "Capture leads, work them through a status pipeline with follow-ups, and convert straight into a student record — course and batch assigned in the same action.",
    points: ["Lead pipeline", "Follow-ups", "One-click convert"],
    scene: <EnquiryScene />,
  },
  {
    title: "Academics & tests",
    description:
      "Courses, subjects and batches form the structure everything hangs off. Tests are scheduled sessions too, so they inherit the same conflict checks as a lecture.",
    points: ["Courses", "Batches", "Marks entry"],
    scene: <AcademicsScene />,
  },
  {
    title: "Attendance",
    description:
      "Schedule lectures, mark whole rosters in seconds, and review a daily summary — or post scans in directly from a biometric device.",
    points: ["Bulk marking", "Biometric", "CSV export"],
    scene: <AttendanceScene />,
  },
  {
    title: "Fees & payments",
    description:
      "Installment plans, gapless receipts, a live UPI QR and a payment-proof queue — all writing through one payment path that can never disagree with itself.",
    points: ["Installments", "UPI QR", "Share links"],
    scene: <FeesScene />,
  },
  {
    title: "Payroll & expenses",
    description:
      "Fixed or per-lecture salary profiles, approved payroll runs, itemised payslips, and an expense ledger — so the cost side of the month closes cleanly.",
    points: ["Salary runs", "Payslips", "Expense ledger"],
    scene: <PayrollScene />,
  },
  {
    title: "Student portal",
    description:
      "A structurally separate app where students see their own attendance, timetable, results, fees and study material — and nothing that isn't theirs.",
    points: ["Timetable", "Results", "Pay fees"],
    scene: <PortalScene />,
  },
];

const OPERATIONS = [
  {
    title: "Parent-teacher meetings",
    description: "Per-batch scheduling with reschedules and a copy-to-WhatsApp message built from one shared template.",
  },
  {
    title: "WhatsApp & email dispatch",
    description: "Per-institute WhatsApp Business config and SMTP override, with one message log row per attempt.",
  },
  {
    title: "Study material library",
    description: "Course-scoped notes, papers and recordings — files or links — hidden from students until there is something to see.",
  },
  {
    title: "Distribution tracking",
    description: "Books, kits and bags issued per student, with a bulk mark-received action for the front desk.",
  },
  {
    title: "Scheduled reminders",
    description: "Dated staff obligations with lead times and repeats, kept separate from anything student-facing.",
  },
  {
    title: "Analytics",
    description: "Enrollment, attendance, test performance and money, filterable by date range, course and batch.",
  },
];

const ROLES = [
  { role: "Owner", scope: "Full control across the institute, its team, its money and its configuration." },
  { role: "Admin", scope: "Day-to-day operations, staff records and institute settings." },
  { role: "Faculty", scope: "Their own batches, lectures, attendance, tests and study material." },
  { role: "Reception", scope: "Enquiries, admissions and front-desk fee collection." },
  { role: "Accountant", scope: "Fees, expenses, payroll and the reports that come off them." },
  { role: "Student", scope: "Their own attendance, timetable, results, fees and notifications." },
];

const SECURITY_POINTS = [
  {
    title: "Tenant isolation by construction",
    description:
      "Every request is scoped by a tenant id stamped from the authenticated token — never read from a body or a URL — so cross-institute access isn't policy, it's impossible.",
  },
  {
    title: "Role-based access, enforced server-side",
    description:
      "Six roles, each scoped to what that desk actually needs. The frontend hides what a role can't use; the backend refuses it regardless.",
  },
  {
    title: "Two-factor authentication",
    description:
      "Opt-in TOTP for every staff role, with encrypted secrets at rest, ten one-time backup codes, and a used code retired the moment it's spent.",
  },
  {
    title: "Traceable records",
    description:
      "Receipts number gaplessly, payroll runs keep their approval history, and an audit log records what changed — so any number can be explained later.",
  },
];

const PORTAL_POINTS = [
  "Attendance history and a rate computed exactly as staff see it",
  "Timetable, upcoming tests and results as they are entered",
  "Fee installments, receipts, and a UPI QR prefilled with what's due",
  "Study material for their course, grouped by subject",
  "Notifications that deep-link to the exact right screen",
];

const STATS = [
  { value: "13", label: "Integrated modules" },
  { value: "6", label: "Built-in roles" },
  { value: "2", label: "Apps: staff console + student portal" },
  { value: "100%", label: "Tenant data isolation" },
];

const TESTIMONIALS = [
  {
    quote:
      "Admissions used to live in one register, fees in a spreadsheet, and attendance on paper. Now the front desk enters something once and everyone downstream already has it.",
    name: "Priya Raghavan",
    role: "Director · Sunrise Academy",
  },
  {
    quote:
      "The month-end close went from two days of reconciling to an afternoon. Payslips and receipts come out of the same system that recorded the money.",
    name: "Sameer Kulkarni",
    role: "Accountant · Vidya Coaching",
  },
  {
    quote:
      "Parents stopped calling to ask about dues. They get the receipt link on WhatsApp and the student sees the balance in the portal.",
    name: "Nikhil Bose",
    role: "Owner · Apex Tutorials",
  },
];

const FAQS = [
  {
    question: "Who is TutorGO built for?",
    answer:
      "Coaching institutes, schools and colleges outgrowing spreadsheets — anywhere admissions, attendance, fees and payroll are tracked in separate places and stitched together by hand at the end of the month.",
  },
  {
    question: "How is my institute's data kept separate?",
    answer:
      "Each institute is a fully isolated tenant with its own data, users and roles. Every request is scoped by a tenant id taken from the signed session, never from anything the client sends, so one workspace can never read another's records.",
  },
  {
    question: "Can we run several branches under one organisation?",
    answer:
      "Yes. An organisation is the paying customer; each branch or campus is its own institute underneath it, with its own staff, students and data — and its own module set.",
  },
  {
    question: "Can we use only some of the modules?",
    answer:
      "Yes. Enquiry, admission, attendance, fees, payroll and expense are enabled per institute, so you can start with admissions and attendance and switch the rest on later. Staff only ever see what's turned on.",
  },
  {
    question: "How do students and parents pay?",
    answer:
      "You configure your own UPI ID. The portal renders a live QR generated in the browser and a tap-to-pay link prefilled with what's actually due, and students can submit a payment screenshot that staff approve into a real receipt.",
  },
  {
    question: "How do we get started?",
    answer:
      "Institutes are provisioned by the platform team. Once your workspace and owner account exist, you sign in, set up courses and batches, invite your staff — by CSV if you have a list — and start admitting students.",
  },
];

/* -------------------------------------------------------------- Primitives */

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading TutorGO…
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M5 12.5l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* -------------------------------------------------------------------- Page */

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/dashboard");
  }, [loading, user, router]);

  if (loading || user) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-background">
      <LandingNav />

      <main>
        {/* ---------------------------------------------------------------- Hero */}
        <section className="relative isolate overflow-hidden">
          {/* Backdrop: a soft brand wash, a grid that fades toward the fold, and
              the campus scene sitting on the horizon behind the product frame. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-32 -z-20 h-[38rem] [background:radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--accent)_18%,transparent)_0%,transparent_75%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-20 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[26rem] opacity-70 sm:h-[30rem]">
            <CampusScene className="h-full w-full" />
            <div className="absolute inset-x-0 bottom-0 h-40 [background:linear-gradient(to_top,var(--background),transparent)]" />
          </div>

          <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-(--shadow-card)">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                Multi-tenant ERP for education businesses
              </span>

              <h1 className="font-display mt-7 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-balance text-foreground sm:text-6xl lg:text-[4rem]">
                Run your whole institute from{" "}
                <span className="relative whitespace-nowrap text-accent">
                  one place
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 300 12"
                    preserveAspectRatio="none"
                    className="absolute -bottom-1 left-0 h-[0.4em] w-full text-accent/30"
                  >
                    <path d="M2 8c60-6 130-7 296-3" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Admissions, academics, attendance, fees, payroll and expenses — one connected
                workspace scoped to every desk in the building, plus a portal your students
                actually log into. Stop reconciling six spreadsheets at the end of every month.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/login" className="w-full sm:w-auto">
                  <Button variant="accent" className="w-full px-7 py-3.5 text-base sm:w-auto">
                    Get started
                    <ArrowIcon />
                  </Button>
                </Link>
                <Link href="#modules" className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full px-7 py-3.5 text-base sm:w-auto">
                    See it in action
                  </Button>
                </Link>
              </div>

              <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
                {["Isolated per institute", "Role-based access", "Modules on demand"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success-soft text-success">
                      <CheckIcon />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Product frame, with the student portal overlapping it on the
                right — the two halves of the product in one glance. On mobile
                the phone is dropped rather than shrunk into illegibility. */}
            <div className="relative mt-16 sm:mt-20">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-8 -top-6 bottom-8 -z-10 rounded-[2rem] bg-accent/5 blur-2xl"
              />
              <AppPreview />
              <PhoneMock className="absolute -bottom-10 -right-6 hidden lg:block" />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- Stats */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center lg:text-left">
                <p className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{stat.value}</p>
                <p className="mt-1.5 text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------------ Features */}
        <section id="features" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <SectionHeading
              eyebrow="Modules"
              title="Everything your institute runs on"
              description="Each module switches on or off per institute — start with what you need today, enable the rest as you grow."
            />

            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <FeatureCard
                  key={feature.title}
                  scene={feature.scene}
                  title={feature.title}
                  description={feature.description}
                  points={feature.points}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- Module deep-dive */}
        <section id="modules" className="scroll-mt-20 border-y border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <SectionHeading
              eyebrow="A closer look"
              title="The screens your team lives in"
              description="Four of the modules, and the day-to-day work each one takes off someone's desk."
              centered
            />

            <div className="mt-12">
              <ModuleShowcase />
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- Student portal */}
        <section id="portal" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="tg-mesh relative overflow-hidden rounded-3xl px-6 py-14 sm:px-12 sm:py-16">
              <div className="relative z-10 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/80">
                    Student portal
                  </span>
                  <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight text-balance text-primary-foreground sm:text-4xl">
                    The app your students and parents actually open
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-primary-foreground/75">
                    A structurally separate app with its own gate. Every read is scoped to the
                    signed-in student&apos;s own record — never to an id in the URL — so one student can
                    never see another&apos;s marks, dues or attendance.
                  </p>

                  <ul className="mt-7 flex flex-col gap-3">
                    {PORTAL_POINTS.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm leading-relaxed text-primary-foreground/90">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15 text-primary-foreground">
                          <CheckIcon />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>

                  <p className="mt-7 text-sm text-primary-foreground/60">
                    Logins are issued per student by staff — never created automatically at admission.
                  </p>
                </div>

                {/* Two screens, fanned. The second is hidden on small screens
                    where there isn't room for it to overlap cleanly. */}
                <div className="flex justify-center lg:justify-end">
                  <div className="relative flex items-end">
                    <PhoneMock screen="home" className="hidden sm:block sm:-mr-14 sm:rotate-[-6deg]" />
                    <PhoneMock screen="fees" className="sm:rotate-[4deg]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- Operations */}
        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <SectionHeading
              eyebrow="And the rest of the day"
              title="The work that doesn't fit in a module name"
              description="Meetings, messages, materials and the small obligations an institute carries — handled in the same workspace rather than in someone's notebook."
              centered
            />

            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {OPERATIONS.map((op) => (
                <div key={op.title} className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)">
                  <h3 className="font-display text-base font-semibold text-foreground">{op.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{op.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- Roles */}
        <section id="roles" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:gap-16">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <SectionHeading
                  eyebrow="Access"
                  title="One product, six points of view"
                  description="Nobody should scroll past screens that aren't theirs. Every role opens into the work that desk is actually responsible for — and the server enforces it, not just the menu."
                />
              </div>

              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-card)">
                {ROLES.map((r) => (
                  <li
                    key={r.role}
                    className="flex flex-col gap-1 px-5 py-4 transition-colors duration-150 hover:bg-secondary/50 sm:flex-row sm:items-center sm:gap-6"
                  >
                    <span className="font-display w-32 shrink-0 text-sm font-semibold text-foreground">{r.role}</span>
                    <span className="text-sm leading-relaxed text-muted-foreground">{r.scope}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ Security */}
        <section id="security" className="scroll-mt-20 border-y border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
              <div>
                <SectionHeading
                  eyebrow="Architecture"
                  title="Multi-tenant from the first table"
                  description="Isolation isn't a setting that can be switched off by accident — it's the shape of the data model under every module."
                />

                <div className="mt-10 flex flex-col gap-5">
                  {SECURITY_POINTS.map((point) => (
                    <div key={point.title} className="flex gap-4">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                        <CheckIcon />
                      </span>
                      <div>
                        <h3 className="font-display text-base font-semibold text-foreground">{point.title}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{point.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card) sm:p-8">
                <TenancyScene className="h-auto w-full" />
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- Testimonials */}
        <section className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <SectionHeading eyebrow="Institutes" title="What changes in the first month" centered />

            <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {TESTIMONIALS.map((t) => (
                <figure
                  key={t.name}
                  className="flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)"
                >
                  <blockquote className="text-sm leading-relaxed text-foreground">
                    <span aria-hidden="true" className="font-display mr-1 text-2xl leading-none text-accent">
                      &ldquo;
                    </span>
                    {t.quote}
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                      {t.name.charAt(0)}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{t.name}</span>
                      <span className="block text-xs text-muted-foreground">{t.role}</span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- FAQ */}
        <section id="faq" className="scroll-mt-20 border-t border-border bg-muted/40">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <SectionHeading eyebrow="FAQ" title="Questions institutes ask us first" centered />

            <div className="mt-10 flex flex-col gap-3">
              {FAQS.map((faq) => (
                <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- Closing CTA */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
          <div className="tg-mesh relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12 sm:py-20">
            <div className="relative z-10 mx-auto max-w-2xl">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-primary-foreground sm:text-4xl">
                Ready to bring your institute online?
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-primary-foreground/75">
                Sign in to your workspace, or reach out to have your institute provisioned by the
                platform team.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/login" className="w-full sm:w-auto">
                  <Button variant="accent" className="w-full px-6 py-3 text-base sm:w-auto">
                    Log in to TutorGO
                    <ArrowIcon />
                  </Button>
                </Link>
                <a href="#features" className="w-full sm:w-auto">
                  <Button
                    variant="ghost"
                    className="w-full border border-primary-foreground/25 px-6 py-3 text-base text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto"
                  >
                    See what&apos;s included
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* -------------------------------------------------------------- Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5">
                <Logo />
                <span className="font-display text-lg font-semibold tracking-tight text-foreground">TutorGO</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                A multi-tenant ERP for coaching institutes, schools and colleges — from the first
                enquiry to the last payslip.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">Product</h3>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted-foreground">
                {[
                  { href: "#features", label: "Features" },
                  { href: "#modules", label: "Modules" },
                  { href: "#portal", label: "Student portal" },
                  { href: "#roles", label: "Roles" },
                  { href: "#security", label: "Architecture" },
                ].map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="transition-colors duration-150 hover:text-foreground">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground">Get started</h3>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm text-muted-foreground">
                <li>
                  <Link href="/login" className="transition-colors duration-150 hover:text-foreground">
                    Log in
                  </Link>
                </li>
                <li>
                  <a href="#faq" className="transition-colors duration-150 hover:text-foreground">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} TutorGO. All rights reserved.</p>
            <p>Built for education businesses.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
