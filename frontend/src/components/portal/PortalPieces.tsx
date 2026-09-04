import type { ReactNode } from "react";

/*
 * The portal's reveal animations are pure CSS (`tg-stagger` / `tg-rise` in
 * globals.css), not a JS animation library. An animation library earns its
 * bundle when animations are *interruptible* — springs that inherit velocity
 * mid-flight. Nothing here is interruptible: these are one-shot reveals on
 * mount and a background colour change on the active nav item, which is
 * exactly what the reference design (mobile.tsx) does with `transition-all`.
 * Measured: adding Motion cost ~46 kB of first-load JS for no visible gain.
 */

/** A `<ul>` whose children fade and rise in sequence. */
export function StaggerList({ children, className = "space-y-2" }: { children: ReactNode; className?: string }) {
  return <ul className={`tg-stagger ${className}`}>{children}</ul>;
}

/** One row inside a `StaggerList`. */
export function StaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <li className={className}>{children}</li>;
}

/** Grid wrapper for the stat tiles — same stagger, laid out as a grid. */
export function StaggerGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`tg-stagger ${className}`}>{children}</div>;
}

/**
 * Small shared pieces for the student portal.
 *
 * The portal's layout follows the reference design in mobile.tsx — a compact
 * stat grid with one emphasis tile, a "what's next" hero, and upcoming/past
 * list sections — but every colour, radius and font here comes from the app's
 * own theme tokens rather than that file's hard-coded palette. It has to read
 * as the same product a staff member sees, not a second design language.
 */

/** Section heading with an optional right-aligned action. */
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

/** Rounded icon chip. `onDark` flips it for use inside the emphasis tile. */
export function IconChip({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
        onDark ? "bg-primary-foreground/15 text-primary-foreground" : "border border-border bg-muted text-foreground"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * One tile in the portal's stat grid. `emphasis` renders the filled variant
 * used for the single most important number on the screen — one per grid, the
 * way the reference design uses exactly one dark tile.
 */
export function PortalStat({
  label,
  value,
  sub,
  icon,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex h-full min-h-28 flex-col justify-between rounded-xl p-4 ${
        emphasis
          ? "bg-primary text-primary-foreground"
          : "border border-border bg-card shadow-(--shadow-card)"
      }`}
    >
      {icon && <IconChip onDark={emphasis}>{icon}</IconChip>}
      <div className="mt-3">
        <p className={`text-xs ${emphasis ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{label}</p>
        <p
          className={`font-display mt-0.5 text-2xl font-semibold leading-none ${
            emphasis ? "text-primary-foreground" : "text-foreground"
          }`}
        >
          {value}
        </p>
        {sub && (
          <p className={`mt-1 text-xs ${emphasis ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{sub}</p>
        )}
      </div>
    </div>
  );
}

/** Page header shared by every portal screen, so they stack consistently. */
export function PortalHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
      <h1 className="font-display mt-1 text-3xl font-bold text-foreground">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

/** Consistent "nothing here yet" block — used rather than a bare line of grey
 * text so an empty timetable doesn't look like a failed load. */
export function PortalEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

export const ICONS = {
  check: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8.5 13.5l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  medal: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="15" r="5" />
      <path d="M9 10L7 3h10l-2 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  book: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2z" strokeLinejoin="round" />
      <path d="M8 7h7M8 11h7" strokeLinecap="round" />
    </svg>
  ),
  rupee: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 4h10M7 9h10M15.5 4c0 4-2.5 5-5 5H7l7 11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  clock: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bell: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 10-12 0c0 6-2 7-2 7h16s-2-1-2-7z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 20a2 2 0 01-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
