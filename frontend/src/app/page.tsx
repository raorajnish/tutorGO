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
import { SectionHeading } from "@/components/marketing/SectionHeading";

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
} as const;

const FEATURES = [
  {
    title: "Enquiry to Admission",
    description:
      "Capture leads, run them through a status pipeline, and convert them straight into student records — no re-entry.",
    points: ["Lead pipeline", "Follow-ups", "One-click convert"],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 6h13M3 12h9M3 18h6" strokeLinecap="round" />
        <path d="M17 15l3 3 4-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Academics",
    description:
      "Courses, subjects and batches form the structure everything else — students, lectures, attendance — hangs off.",
    points: ["Courses", "Batches", "Subjects"],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M2.5 8.5L12 4l9.5 4.5L12 13 2.5 8.5z" strokeLinejoin="round" />
        <path d="M6.5 10.8V15c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3v-4.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Attendance",
    description:
      "Schedule lectures, mark rosters in seconds, and review daily summaries — with optional biometric device support.",
    points: ["Lecture scheduling", "Roster marking", "Biometric"],
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" strokeLinecap="round" />
        <path d="M9 14.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Fees & Payments",
    description:
      "Installment plans, receipts and auto-reconciled payments, with reminders that chase dues so your desk doesn't have to.",
    points: ["Installments", "Receipts", "Reminders"],
    icon: (
      <svg {...ICON_PROPS}>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
        <path d="M2.5 10h19" strokeLinecap="round" />
        <path d="M6.5 14.5h4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Payroll & Expenses",
    description:
      "Faculty salary runs, payslips and institute expenses tracked together, so the cost side of the month closes cleanly.",
    points: ["Salary runs", "Payslips", "Expense log"],
    icon: (
      <svg {...ICON_PROPS}>
        <path d="M3 20V10M9 20V4M15 20v-7M21 20V7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Staff Directory",
    description:
      "A single directory for faculty, admin and reception with roles, salary settings and active/inactive status.",
    points: ["Roles", "Salary settings", "Status"],
    icon: (
      <svg {...ICON_PROPS}>
        <circle cx="9" cy="8" r="3.25" />
        <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5M16 4.7A3.9 3.9 0 0 1 16 12M21 20c0-2.5-1.7-4.4-4-4.9" strokeLinecap="round" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    step: "01",
    title: "We provision your institute",
    description:
      "The platform team creates your workspace, sets up your owner account and enables exactly the modules you need.",
  },
  {
    step: "02",
    title: "You onboard your team",
    description:
      "Set up courses and batches, invite staff with the right roles, and configure attendance, fees and payroll.",
  },
  {
    step: "03",
    title: "Run day-to-day operations",
    description:
      "Admissions, attendance, fees and payroll — handled from one role-aware dashboard, every single day.",
  },
];

const ROLES = [
  { role: "Owner", scope: "Full control across the institute, billing and module access." },
  { role: "Admin", scope: "Day-to-day operations, staff records and institute configuration." },
  { role: "Faculty", scope: "Their own batches, lectures, attendance and student progress." },
  { role: "Reception", scope: "Enquiries, admissions and front-desk fee collection." },
  { role: "Accountant", scope: "Fees, expenses, payroll and the reports that come off them." },
  { role: "Student", scope: "Their own attendance, fee status, schedule and results." },
];

const SECURITY_POINTS = [
  {
    title: "Tenant-isolated data",
    description: "Every institute is its own workspace. Records never cross a tenant boundary — by design, not by filter.",
  },
  {
    title: "Role-based access control",
    description: "Six roles, each scoped to what that desk actually needs. Permissions are enforced server-side.",
  },
  {
    title: "Per-institute modules",
    description: "Switch modules on or off per institute, so staff only ever see the parts of the product you bought.",
  },
  {
    title: "Traceable records",
    description: "Admissions, payments and payroll runs keep their history, so the numbers can always be explained.",
  },
];

const STATS = [
  { value: "13", label: "Integrated modules" },
  { value: "6", label: "Built-in user roles" },
  { value: "100%", label: "Tenant data isolation" },
  { value: "1", label: "Workspace to run it all" },
];

const FAQS = [
  {
    question: "Who is TutorGO built for?",
    answer:
      "Coaching institutes, schools and colleges that are outgrowing spreadsheets — anywhere admissions, attendance, fees and payroll are being tracked in separate places and stitched together by hand.",
  },
  {
    question: "How is my institute's data kept separate?",
    answer:
      "Each institute is provisioned as an isolated tenant with its own data, users and roles. There is no shared record space between institutes, so one workspace can never read another's data.",
  },
  {
    question: "Can we use only some of the modules?",
    answer:
      "Yes. Modules are enabled per institute, so you can start with admissions and attendance and switch on fees, payroll or expenses later. Staff only see the modules that are turned on.",
  },
  {
    question: "Does every staff member see everything?",
    answer:
      "No. Access is role-based across owner, admin, faculty, reception, accountant and student roles, and every role is scoped to the records that desk needs to do its job.",
  },
  {
    question: "How do we get started?",
    answer:
      "Institutes are provisioned by the platform team. Once your workspace and owner account exist, you sign in, set up your courses and batches, and invite your staff.",
  },
];

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading TutorGO…
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M5 12.5l5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
          {/* Decorative backdrop: a soft brand wash, a faint grid that fades out
              toward the fold, and a hairline that meets the section below. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-32 -z-10 h-[38rem] [background:radial-gradient(60%_50%_at_50%_0%,color-mix(in_srgb,var(--accent)_18%,transparent)_0%,transparent_75%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
          />

          <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-24 lg:px-8">
            {/* Lead */}
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-(--shadow-card)">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                Multi-tenant ERP for education businesses
              </span>

              <h1 className="font-display mt-7 text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-balance text-foreground sm:text-6xl lg:text-[4rem]">
                The operating system for your{" "}
                <span className="relative whitespace-nowrap text-accent">
                  institute
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
                Admissions, academics, attendance, fees, expenses and payroll — one connected
                workspace, scoped to every desk in the building. Stop reconciling six spreadsheets
                at the end of every month.
              </p>

              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link href="/login" className="w-full sm:w-auto">
                  <Button variant="accent" className="w-full px-7 py-3.5 text-base sm:w-auto">
                    Get started
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h13M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Button>
                </Link>
                <Link href="#features" className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full px-7 py-3.5 text-base sm:w-auto">
                    Explore the modules
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

            {/* Product frame — sits under the lead so the full UI gets real width. */}
            <div className="relative mt-16 sm:mt-20">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-8 -top-6 bottom-8 -z-10 rounded-[2rem] bg-accent/5 blur-2xl"
              />
              <AppPreview />
              {/* Fades the bottom edge of the mock into the page rather than
                  cutting it off with a hard border. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 -bottom-1 h-24 [background:linear-gradient(to_top,var(--background),transparent)]"
              />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- Stats */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center lg:text-left">
                <p className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  {stat.value}
                </p>
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
              description="Each module can be switched on or off per institute — start with what you need, enable the rest as you grow."
            />

            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <FeatureCard
                  key={feature.title}
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  points={feature.points}
                />
              ))}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------- How it works */}
        <section id="how-it-works" className="scroll-mt-20 border-y border-border bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
            <SectionHeading
              eyebrow="How it works"
              title="Two layers, one workspace"
              description="A platform layer provisions and manages institutes; each institute then runs its own fully isolated, role-based workspace day to day."
              centered
            />

            <div className="relative mt-14 grid grid-cols-1 gap-6 sm:grid-cols-3">
              {/* Connector rail behind the step cards, desktop only. */}
              <div aria-hidden="true" className="absolute inset-x-12 top-11 hidden h-px bg-border sm:block" />

              {STEPS.map((s) => (
                <div
                  key={s.step}
                  className="relative rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)"
                >
                  <div className="font-display flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-sm font-semibold text-accent-foreground">
                    {s.step}
                  </div>
                  <h3 className="font-display mt-5 text-base font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
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
                  description="Nobody should have to scroll past screens that aren't theirs. Every role opens into the work that desk is actually responsible for."
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
            <SectionHeading
              eyebrow="Architecture"
              title="Built multi-tenant from the first table"
              description="Isolation isn't a setting that can be toggled off by accident — it's the shape of the data model underneath every module."
              centered
            />

            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {SECURITY_POINTS.map((point) => (
                <div
                  key={point.title}
                  className="flex gap-4 rounded-2xl border border-border bg-card p-6 shadow-(--shadow-card)"
                >
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
        </section>

        {/* ----------------------------------------------------------------- FAQ */}
        <section id="faq" className="scroll-mt-20">
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
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 sm:pb-24 lg:px-8">
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
                <li>
                  <a href="#features" className="transition-colors duration-150 hover:text-foreground">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="transition-colors duration-150 hover:text-foreground">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#roles" className="transition-colors duration-150 hover:text-foreground">
                    Roles
                  </a>
                </li>
                <li>
                  <a href="#security" className="transition-colors duration-150 hover:text-foreground">
                    Architecture
                  </a>
                </li>
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
