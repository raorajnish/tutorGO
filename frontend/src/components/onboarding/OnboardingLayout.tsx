import type { ReactNode } from "react";

interface OnboardingLayoutProps {
  stepLabel: string;
  title: string;
  description: string;
  bullets?: string[];
  children: ReactNode;
}

export function OnboardingLayout({ stepLabel, title, description, bullets, children }: OnboardingLayoutProps) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      {/* Step panel */}
      <div className="tg-mesh relative hidden flex-col justify-between overflow-hidden p-12 xl:p-16 lg:flex">
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-card/15 text-base font-bold text-primary-foreground backdrop-blur-sm">
            T
          </div>
          <span className="font-display text-lg font-semibold text-primary-foreground">TutorGO</span>
        </div>

        <div className="relative max-w-md">
          <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-primary-foreground backdrop-blur-sm">
            {stepLabel}
          </span>
          <h1 className="font-display mt-4 text-4xl font-semibold leading-tight text-primary-foreground xl:text-5xl">{title}</h1>
          <p className="mt-3 text-sm text-primary-foreground/70">{description}</p>

          {bullets && (
            <ul className="mt-6 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-sm text-primary-foreground">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="mt-0.5 shrink-0 text-primary-foreground/80"
                  >
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-primary-foreground/60">
          <span>Enquiries</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <span>Admissions</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <span>Attendance</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <span>Fees</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <span>Payroll</span>
        </div>

        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/5" aria-hidden="true" />
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
                T
              </div>
              <span className="font-display text-lg font-semibold text-foreground">TutorGO</span>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{stepLabel}</span>
          </div>

          <h2 className="font-display text-xl font-semibold text-foreground lg:hidden">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground lg:hidden">{description}</p>

          <div className="mt-6 lg:mt-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
