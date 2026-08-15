"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";
import { FeatureCard } from "@/components/marketing/FeatureCard";

const FEATURES = [
  {
    title: "Enquiry to Admission",
    description:
      "Capture leads, run them through a status pipeline, and convert them straight into student records — no re-entry.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 4v16m8-8H4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Academics",
    description:
      "Courses, subjects and batches form the structure everything else — students, lectures, attendance — hangs off.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Attendance",
    description:
      "Schedule lectures, mark rosters in seconds, view daily summaries, with optional biometric device support.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M4 10h16M8 3v4M16 3v4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Fees & Payroll",
    description:
      "Installment plans, receipts and auto-reconciled payments on one side; faculty salary runs and payslips on the other.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M9 10.5c0-1 1-1.5 3-1.5s3 1 3 2-1 1.5-3 1.5-3 .5-3 1.5 1 2 3 2 3-.5 3-1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Staff",
    description:
      "A single directory for faculty, admin and reception with roles, salary settings and active/inactive status.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5M16 4.5c1.7.4 3 2 3 3.9 0 1.9-1.3 3.5-3 3.9M21 20c0-2.5-1.7-4.4-4-4.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Multi-tenant Platform Control",
    description:
      "Every institute is an isolated workspace with its own data, roles and module access — no cross-tenant leakage.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    step: "1",
    title: "We provision your institute",
    description: "The platform team creates your workspace, sets up your owner account and enables the modules you need.",
  },
  {
    step: "2",
    title: "You onboard your team",
    description: "Set up courses and batches, invite staff, and configure attendance, fees and payroll for your institute.",
  },
  {
    step: "3",
    title: "Run day-to-day operations",
    description: "Admissions, attendance, fees and payroll — handled from one role-aware dashboard, every day.",
  },
];

function MeshStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 p-4 backdrop-blur-sm">
      <p className="text-xs font-medium text-primary-foreground/70">{label}</p>
      <p className="font-display mt-1 text-xl font-semibold text-primary-foreground">{value}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
      Loading TutorGO…
    </div>
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
      {/* Header / nav */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
              T
            </div>
            <span className="font-display text-lg font-semibold text-foreground">TutorGO</span>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-foreground">
              How it works
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="secondary">Log in</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-border bg-card shadow-(--shadow-overlay)">
          <div className="grid lg:grid-cols-2">
            <div className="flex flex-col justify-center px-6 py-12 sm:px-10 lg:py-16">
              <span className="inline-flex w-fit items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                Multi-tenant ERP for education businesses
              </span>
              <h1 className="mt-5 text-3xl font-semibold leading-tight text-foreground sm:text-4xl lg:text-[2.75rem]">
                From enquiry to payroll, run your institute in one workspace.
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                TutorGO is a multi-tenant ERP built for coaching institutes, schools and colleges —
                admissions, academics, attendance, fees, expenses and staff payroll, all in one
                place, with role-based access for every desk in the building.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/login">
                  <Button variant="accent" className="px-6 py-3 text-base">
                    Get started
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="ghost" className="px-6 py-3 text-base">
                    Log in
                  </Button>
                </Link>
              </div>
            </div>

            <div className="tg-mesh relative hidden flex-col justify-between p-10 lg:flex">
              <span className="relative text-2xl text-primary-foreground/90" aria-hidden="true">
                ✦
              </span>

              <div className="relative grid grid-cols-2 gap-3">
                <MeshStat label="Modules" value="13" />
                <MeshStat label="User roles" value="6" />
                <MeshStat label="Workspace" value="Isolated" />
                <MeshStat label="Access control" value="RBAC" />
              </div>
            </div>
          </div>

          {/* Mobile stat row (mesh panel is desktop-only) */}
          <div className="grid grid-cols-2 gap-4 border-t border-border p-6 sm:px-10 lg:hidden">
            <StatCard label="Modules" value="13" tone="primary" />
            <StatCard label="User roles" value="6" tone="accent" />
            <StatCard label="Workspace" value="Isolated" tone="success" />
            <StatCard label="Access control" value="RBAC" tone="warning" />
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Everything your institute runs on</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Each module can be switched on or off per institute — start with what you need,
            enable the rest as you grow.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} icon={feature.icon} title={feature.title} description={feature.description} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-y border-border bg-muted">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Two layers, one workspace</h2>
            <p className="mt-3 text-base text-muted-foreground">
              A platform layer provisions and manages institutes; each institute then runs its own
              fully isolated, role-based workspace day to day.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.step} className="rounded-xl border border-border bg-card p-5 shadow-(--shadow-card)">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {s.step}
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Ready to bring your institute online?</h2>
        <p className="mx-auto mt-3 max-w-md text-base text-muted-foreground">
          Sign in to your workspace, or reach out to have your institute provisioned.
        </p>
        <div className="mt-6">
          <Link href="/login">
            <Button variant="primary" className="px-6 py-3 text-base">
              Log in to TutorGO
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              T
            </div>
            <span className="font-medium text-foreground">TutorGO</span>
          </div>
          <p>© {new Date().getFullYear()} TutorGO. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
