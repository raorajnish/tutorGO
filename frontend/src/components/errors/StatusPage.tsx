import Link from "next/link";

interface StatusPageProps {
  code: string;
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}

/** Shared full-bleed layout for 404/403 (and any future status page) — the
 * same tg-mesh textured background and soft blurred circles used on the
 * login screen's brand panel, so an error page still looks like this app
 * rather than a bare browser error. Centered, and the numeral scales down on
 * small screens so it never overflows or forces horizontal scroll. */
export function StatusPage({ code, title, description, actionHref, actionLabel }: StatusPageProps) {
  return (
    <div className="tg-mesh relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/10" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/5" aria-hidden="true" />

      <div className="relative w-full max-w-md text-center">
        <p className="font-display text-[6rem] font-bold leading-none text-primary-foreground sm:text-[8rem]">{code}</p>
        <h1 className="font-display mt-2 text-xl font-semibold text-primary-foreground sm:text-2xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-primary-foreground/70">{description}</p>
        <Link
          href={actionHref}
          className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-card/15 px-5 py-2.5 text-sm font-medium text-primary-foreground backdrop-blur-sm transition-colors hover:bg-card/25"
        >
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
