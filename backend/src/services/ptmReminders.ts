import { prisma } from "../lib/prisma.js";
import { notifyBatch } from "./studentNotify.js";
import { toTimeString } from "../lib/lectureShared.js";

/**
 * Pre-meeting reminders for ParentMeeting — a much simpler sibling of
 * reminderScheduler.ts's ScheduledReminder ticker. That machinery exists for
 * arbitrary staff-defined lead times with a cursor to track "what's the next
 * one still owed"; a PTM only ever needs two fixed leads (1 day, 2 hours), so
 * a plain nullable timestamp per lead — has this fired yet, yes/no — is all
 * the state this needs. See changes-phase11.md §11.2.
 */

const DAY_BEFORE_MS = 24 * 60 * 60_000;
const HOUR_BEFORE_MS = 2 * 60 * 60_000;

function meetingStartsAt(date: Date, startTime: Date): Date {
  const d = new Date(date);
  d.setUTCHours(startTime.getUTCHours(), startTime.getUTCMinutes(), 0, 0);
  return d;
}

async function fireLead(meeting: {
  id: string;
  title: string;
  instituteId: string;
  batchId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  course: { name: string };
  batch: { name: string };
}) {
  await notifyBatch({
    instituteId: meeting.instituteId,
    batchId: meeting.batchId,
    type: "PTM_SCHEDULED",
    title: `Reminder — ${meeting.title}`,
    vars: {
      title: meeting.title,
      batch: meeting.batch.name,
      course: meeting.course.name,
      date: meeting.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
      startTime: toTimeString(meeting.startTime),
      endTime: toTimeString(meeting.endTime),
      cancelReason: "",
    },
    metadata: { meetingId: meeting.id },
  });
}

/** One pass: finds meetings whose day-before or hour-before lead has come due
 * and hasn't fired yet, fires it, and stamps the timestamp so it's never
 * fired twice. Cancelled meetings are excluded outright — nobody needs a
 * reminder for a meeting that isn't happening. */
export async function runDuePtmReminders(): Promise<{ dayBefore: number; hourBefore: number }> {
  const now = new Date();
  const meetingInclude = {
    course: { select: { name: true } },
    batch: { select: { name: true } },
  } as const;

  const candidates = await prisma.parentMeeting.findMany({
    where: {
      cancelledAt: null,
      // Only ever a small forward window of upcoming meetings — this never
      // scans the whole table, however many meetings accumulate over time.
      date: { gte: new Date(now.getTime() - DAY_BEFORE_MS), lte: new Date(now.getTime() + DAY_BEFORE_MS) },
      OR: [{ dayBeforeRemindedAt: null }, { hourBeforeRemindedAt: null }],
    },
    include: meetingInclude,
  });

  let dayBefore = 0;
  let hourBefore = 0;

  for (const meeting of candidates) {
    const startsAt = meetingStartsAt(meeting.date, meeting.startTime);

    if (meeting.dayBeforeRemindedAt === null && startsAt.getTime() - now.getTime() <= DAY_BEFORE_MS) {
      await fireLead(meeting).catch(() => {});
      await prisma.parentMeeting.update({ where: { id: meeting.id }, data: { dayBeforeRemindedAt: now } });
      dayBefore += 1;
    }

    if (meeting.hourBeforeRemindedAt === null && startsAt.getTime() - now.getTime() <= HOUR_BEFORE_MS) {
      await fireLead(meeting).catch(() => {});
      await prisma.parentMeeting.update({ where: { id: meeting.id }, data: { hourBeforeRemindedAt: now } });
      hourBefore += 1;
    }
  }

  return { dayBefore, hourBefore };
}

let timer: NodeJS.Timeout | null = null;

/** Starts the in-process ticker. Called from server.ts only — same rule as
 * startReminderScheduler(): importing app.ts alone (tests, scripts) must
 * never start background work. */
export function startPtmReminderScheduler(): void {
  if (process.env.PTM_REMINDER_SCHEDULER === "off") {
    console.log("[ptm-reminders] scheduler disabled via PTM_REMINDER_SCHEDULER=off");
    return;
  }
  if (timer) return;

  // Every 30 minutes: the tighter of the two leads (2 hours) still has
  // comfortable slack at that resolution, and PTMs are low-volume enough that
  // polling more often would just be wasted queries.
  const minutes = Number(process.env.PTM_REMINDER_SCHEDULER_INTERVAL_MINUTES ?? 30);
  const intervalMs = Math.max(1, minutes) * 60_000;

  async function tick() {
    try {
      const { dayBefore, hourBefore } = await runDuePtmReminders();
      if (dayBefore || hourBefore) {
        console.log(`[ptm-reminders] dayBefore=${dayBefore} hourBefore=${hourBefore}`);
      }
    } catch (err) {
      console.error("[ptm-reminders] scheduler pass failed:", err);
    }
  }

  setTimeout(tick, 15_000);
  timer = setInterval(tick, intervalMs);
  timer.unref?.();

  console.log(`[ptm-reminders] scheduler started (every ${minutes}m)`);
}
