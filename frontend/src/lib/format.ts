/** Shared date/time formatters — every institute using this app operates in
 * India, so every one of these is pinned to Asia/Kolkata explicitly rather
 * than trusting the browser's local timezone. Without that pin, a staff
 * member (or a CI/test run) on a machine set to a different timezone would
 * see a different calendar day than the one the record actually means —
 * the same class of bug fixed on the backend by lib/dateOnly.ts's UTC pin. */

const IST_TIME_ZONE = "Asia/Kolkata";

interface FormatDateOptions {
  /** Prefix with the short weekday name ("Mon, 5 Aug 2026"). */
  weekday?: boolean;
  /** Drop the year ("5 Aug") — for contexts where every date is this year. */
  year?: boolean;
}

/** "5 Aug 2026" by default. Returns "—" for a null/undefined input so call
 * sites don't each need their own nullable guard. */
export function formatDate(iso: string | null | undefined, opts?: FormatDateOptions): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    timeZone: IST_TIME_ZONE,
    weekday: opts?.weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: opts?.year === false ? undefined : "numeric",
  });
}

/** "5 Aug 2026, 3:45 pm". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: IST_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Today's date as `YYYY-MM-DD`, for defaulting an `<input type="date">`.
 * Computed in IST regardless of the browser's own timezone — en-CA is the
 * trick here, its locale output is already zero-padded ISO order. */
export function todayInput(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "HH:mm" (24h, already the server's own wall-clock string — see
 * lib/dateOnly.ts's @db.Time note — so this is pure string parsing, not a
 * timezone conversion) → "3:45 PM". */
export function fmtTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
