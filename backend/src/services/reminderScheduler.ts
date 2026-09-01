import { prisma } from "../lib/prisma.js";
import { notify } from "./notify.js";
import { sendPush } from "./push.js";
import { addDays, addMonthsClamped, daysBetween, subtractDays, todayDateOnly } from "../lib/dateOnly.js";
import type { ReminderRepeat, ScheduledReminder } from "../generated/prisma/client.js";

/** Lead times, largest first — the order they fire in. Also de-duplicates, so
 * a UI that lets someone tick "7 days" twice can't create two identical pings. */
export function normalizeLeadDays(leadDays: number[]): number[] {
  return [...new Set(leadDays)].sort((a, b) => b - a);
}

/** The scheduler cursor for a given due date + lead times: the next
 * notification still owed, or nulls when the cycle is fully notified.
 *
 * `alreadyFiredBelow` narrows the candidates to lead times that haven't fired
 * yet. Leads fire in descending order, so "still pending" is exactly "smaller
 * than the one we just fired" — no per-lead history needs storing. */
export function reminderCursor(
  dueDate: Date,
  leadDays: number[],
  opts: { pendingBelow?: number; notBefore?: Date } = {}
): { nextNotifyOn: Date | null; nextNotifyLead: number | null } {
  const { pendingBelow, notBefore } = opts;

  const pending = normalizeLeadDays(leadDays)
    .filter((lead) => (pendingBelow === undefined ? true : lead < pendingBelow))
    // When re-arming after a fire, skip any lead whose date has also already
    // passed — crossing several thresholds at once sends one notification,
    // not a burst of stale ones.
    .filter((lead) => (notBefore === undefined ? true : subtractDays(dueDate, lead) > notBefore));

  const next = pending[0];
  if (next === undefined) return { nextNotifyOn: null, nextNotifyLead: null };
  return { nextNotifyOn: subtractDays(dueDate, next), nextNotifyLead: next };
}

/** The persisted fields that must always move together — writing `dueDate` or
 * `leadDays` without recomputing the cursor would leave the scheduler reading
 * a stale notify date. Every write path goes through this. */
export function reminderNotifyFields(dueDate: Date, leadDays: number[]) {
  const leads = normalizeLeadDays(leadDays);
  return { dueDate, leadDays: leads, ...reminderCursor(dueDate, leads) };
}

/** Next occurrence of a repeating reminder. NONE has no next occurrence. */
export function nextOccurrence(dueDate: Date, repeat: ReminderRepeat): Date | null {
  switch (repeat) {
    case "WEEKLY":
      return addDays(dueDate, 7);
    case "MONTHLY":
      return addMonthsClamped(dueDate, 1);
    case "QUARTERLY":
      return addMonthsClamped(dueDate, 3);
    case "YEARLY":
      return addMonthsClamped(dueDate, 12);
    default:
      return null;
  }
}

/** Rolls a passed due date forward until it's today or later. Loops rather
 * than adding one cycle, so a server that was down for months lands on the
 * correct next occurrence instead of a still-passed one. */
export function advanceUntilFuture(dueDate: Date, repeat: ReminderRepeat, today: Date): Date | null {
  let next = nextOccurrence(dueDate, repeat);
  if (!next) return null;
  // Bounded so a pathological row (e.g. a weekly reminder dated 1970) can't spin.
  for (let i = 0; i < 1000 && next < today; i++) {
    const following = nextOccurrence(next, repeat);
    if (!following) break;
    next = following;
  }
  return next;
}

function buildMessage(reminder: Pick<ScheduledReminder, "title" | "dueDate" | "notes">, today: Date) {
  const days = daysBetween(today, reminder.dueDate);
  const due = reminder.dueDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const when =
    days > 1
      ? `Due in ${days} days (${due})`
      : days === 1
        ? `Due tomorrow (${due})`
        : days === 0
          ? `Due today (${due})`
          : `Overdue since ${due}`;

  return {
    title: reminder.title,
    body: reminder.notes ? `${when} — ${reminder.notes}` : `${when}.`,
  };
}

/** Everyone who should hear about this reminder.
 *
 * PRIVATE → just the creator. ADMINS → the creator, every active ADMIN of the
 * institute, and the organization's OWNER. The owner is fetched via the
 * organization rather than `User.instituteId` because an OWNER's
 * `instituteId` is null by design (see the User model) — filtering users by
 * institute would silently miss them. */
async function resolveRecipients(reminder: ScheduledReminder): Promise<string[]> {
  const ids = new Set<string>([reminder.createdByUserId]);

  if (reminder.audience === "ADMINS") {
    const [admins, institute] = await Promise.all([
      prisma.user.findMany({
        where: { instituteId: reminder.instituteId, isActive: true, role: "ADMIN" },
        select: { id: true },
      }),
      prisma.institute.findUnique({
        where: { id: reminder.instituteId },
        select: { organization: { select: { ownerId: true } } },
      }),
    ]);

    for (const a of admins) ids.add(a.id);
    if (institute?.organization.ownerId) ids.add(institute.organization.ownerId);
  }

  // A creator who has since been deactivated shouldn't keep getting notified.
  const active = await prisma.user.findMany({ where: { id: { in: [...ids] }, isActive: true }, select: { id: true } });
  return active.map((u) => u.id);
}

async function deliver(reminder: ScheduledReminder, today: Date): Promise<number> {
  const recipients = await resolveRecipients(reminder);
  const { title, body } = buildMessage(reminder, today);

  for (const userId of recipients) {
    await notify({
      instituteId: reminder.instituteId,
      userId,
      type: "SCHEDULED_REMINDER",
      title,
      body,
      metadata: { reminderId: reminder.id, category: reminder.category, dueDate: reminder.dueDate.toISOString() },
    });
    // Best-effort second channel; the in-app notification above is the
    // reliable one (same pattern as org.ts's broadcast).
    await sendPush({ userId, title, body }).catch(() => {});
  }

  return recipients.length;
}

/** Fires one reminder's pending notification, then re-arms the cursor onto its
 * next lead time (or clears it when the cycle is done). Returns whether it
 * actually fired.
 *
 * The claim is an atomic compare-and-set: the UPDATE only matches while the
 * cursor still holds the value we read, so if two app instances run the ticker
 * at once (Render can run more than one), exactly one claims the fire and the
 * other no-ops. Claiming before delivering means a crash mid-delivery can drop
 * a notification, which is the right trade against notifying everyone twice. */
async function fireOne(reminder: ScheduledReminder, today: Date): Promise<boolean> {
  const firedLead = reminder.nextNotifyLead;
  if (firedLead === null) return false;

  // Any lead time whose date has also already passed is consumed here too, so
  // a reminder created (or a server recovered) well past several thresholds
  // sends one notification rather than one per missed threshold.
  const rearmed = reminderCursor(reminder.dueDate, reminder.leadDays, {
    pendingBelow: firedLead,
    notBefore: today,
  });

  const claim = await prisma.scheduledReminder.updateMany({
    where: {
      id: reminder.id,
      isActive: true,
      dueDate: reminder.dueDate,
      nextNotifyLead: firedLead,
    },
    data: { lastFiredAt: new Date(), ...rearmed },
  });
  if (claim.count === 0) return false;

  await deliver(reminder, today);
  return true;
}

export interface ReminderRunResult {
  fired: number;
  advanced: number;
  failed: number;
}

/** One pass of the scheduler. Safe to call as often as you like — the
 * compare-and-set in `fireOne` is what prevents duplicates, not the cadence.
 *
 * Order matters: fire *before* rolling repeating reminders forward. A reminder
 * whose due date passed while the server was down must still notify (late, but
 * it notifies) rather than being silently advanced past. */
export async function runDueReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  const today = todayDateOnly(now);
  const result: ReminderRunResult = { fired: 0, advanced: 0, failed: 0 };

  // Both queries below are narrow indexed range scans, not scans of every
  // reminder in the database — this runs on a timer forever, so its cost has
  // to stay flat as institutes are added rather than grow with them.

  // 1. Notify: rows whose next lead time has arrived. Fully served by
  //    @@index([isActive, nextNotifyOn]); a reminder with nothing left to fire
  //    has a NULL cursor and is never read again, however many pile up.
  //    `take` splits a pathological backlog across passes.
  const dueToFire = await prisma.scheduledReminder.findMany({
    where: { isActive: true, nextNotifyOn: { lte: today } },
    orderBy: { nextNotifyOn: "asc" },
    take: 500,
  });

  for (const reminder of dueToFire) {
    try {
      if (await fireOne(reminder, today)) result.fired++;
    } catch (err) {
      // One bad row must not abort the batch.
      result.failed++;
      console.error(`[reminders] failed firing ${reminder.id}:`, err);
    }
  }

  // 2. Roll forward: repeating reminders whose due date is now behind us, so
  //    one row keeps representing "the next occurrence" instead of the table
  //    growing by one row per cycle forever.
  const toAdvance = await prisma.scheduledReminder.findMany({
    where: { isActive: true, repeat: { not: "NONE" }, dueDate: { lt: today } },
    orderBy: { dueDate: "asc" },
    take: 500,
  });

  for (const reminder of toAdvance) {
    try {
      const next = advanceUntilFuture(reminder.dueDate, reminder.repeat, today);
      if (!next) continue;

      const rolled = await prisma.scheduledReminder.updateMany({
        // Guarded on the due date we read, so a concurrent instance that
        // already advanced this row can't double-advance it.
        where: { id: reminder.id, dueDate: reminder.dueDate },
        // A fresh occurrence re-arms every lead time from the top.
        data: reminderNotifyFields(next, reminder.leadDays),
      });
      if (rolled.count > 0) result.advanced++;
    } catch (err) {
      result.failed++;
      console.error(`[reminders] failed advancing ${reminder.id}:`, err);
    }
  }

  return result;
}

/** Fires a reminder immediately regardless of lead time — backs "Send now".
 * Consumes the currently-pending lead time (if any) so the scheduler won't
 * repeat the same notification an hour later. */
export async function sendReminderNow(reminder: ScheduledReminder): Promise<number> {
  const today = todayDateOnly();

  await prisma.scheduledReminder.update({
    where: { id: reminder.id },
    data: {
      lastFiredAt: new Date(),
      ...(reminder.nextNotifyLead === null
        ? {}
        : reminderCursor(reminder.dueDate, reminder.leadDays, {
            pendingBelow: reminder.nextNotifyLead,
            notBefore: today,
          })),
    },
  });

  return deliver(reminder, today);
}

let timer: NodeJS.Timeout | null = null;

/** Starts the in-process ticker. Called from server.ts only — importing
 * app.ts (tests, scripts) must not start background work.
 *
 * An interval that re-asks "what's due?" rather than a cron firing at a fixed
 * instant: if the process is restarting or asleep at the cron moment the work
 * is simply missed, whereas this catches up on the next tick — which matters
 * on Render, where instances restart and free tiers sleep. Set
 * REMINDER_SCHEDULER=off to disable, REMINDER_SCHEDULER_INTERVAL_MINUTES to
 * retune. */
export function startReminderScheduler(): void {
  if (process.env.REMINDER_SCHEDULER === "off") {
    console.log("[reminders] scheduler disabled via REMINDER_SCHEDULER=off");
    return;
  }
  if (timer) return;

  // Hourly by default: reminders resolve to whole days, so a lead time becomes
  // eligible at midnight and firing within the hour is indistinguishable to a
  // user — while polling 24x/day instead of 96x costs a quarter as much. "Send
  // it right now" is served by the Send-now action, not by a tighter loop.
  const minutes = Number(process.env.REMINDER_SCHEDULER_INTERVAL_MINUTES ?? 60);
  const intervalMs = Math.max(1, minutes) * 60_000;

  async function tick() {
    try {
      const { fired, advanced, failed } = await runDueReminders();
      if (fired || advanced || failed) {
        console.log(`[reminders] fired=${fired} advanced=${advanced} failed=${failed}`);
      }
    } catch (err) {
      console.error("[reminders] scheduler pass failed:", err);
    }
  }

  // Small delay on boot so the first pass doesn't race container startup.
  setTimeout(tick, 10_000);
  timer = setInterval(tick, intervalMs);
  // Never hold the process open on its own account.
  timer.unref?.();

  console.log(`[reminders] scheduler started (every ${minutes}m)`);
}
