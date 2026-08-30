/** Helpers for `@db.Date` columns — values that mean a calendar day, not an
 * instant. Everything here works in UTC so a date read back from Postgres
 * compares equal to one built here, regardless of the server's timezone. */

/** Every institute this app serves is in India — "today" always means
 * today on the India Standard Time calendar (UTC+5:30, no DST), not the
 * UTC calendar day and not the host server's local day. Those two only
 * disagree with IST for a few hours around midnight, but that window is
 * exactly when it matters: a cloud server almost always runs its system
 * clock in UTC, so "today" computed naively stays on yesterday's UTC date
 * until 05:30 IST — a lecture scheduled at 1 AM IST would file under
 * "history" instead of "upcoming," and a fee due today could read as not
 * yet due for the first five and a half hours of the Indian day. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** UTC midnight of today, where "today" is the current calendar day in IST. */
export function todayDateOnly(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** UTC midnight of the given date, discarding any time component. */
export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Adds `months`, keeping the day-of-month where possible and clamping to the
 * target month's last day when it doesn't exist (31 Jan + 1 month → 28/29 Feb).
 *
 * Deliberately *not* the same as fees.ts's `addMonthsCapped`, which caps every
 * day at 28 — that's a billing-day rule specific to fee plans. A bill due on
 * the 30th should stay on the 30th. */
export function addMonthsClamped(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDayOfTargetMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return target;
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((toDateOnly(to).getTime() - toDateOnly(from).getTime()) / 86_400_000);
}

/** Subtracts whole days. */
export function subtractDays(date: Date, days: number): Date {
  return addDays(date, -days);
}

/** Adds whole days. */
export function addDays(date: Date, days: number): Date {
  const d = toDateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
