import { prisma } from "../lib/prisma.js";

/** Times are stored as @db.Time — a Date pinned to 1970-01-01 UTC — so raw
 * getTime() comparison is exactly a same-day clock comparison. */
function minutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export interface ConflictSplit {
  /** The lecture the new session lands inside of. */
  conflictLectureId: string;
  conflictLabel: string;
  /** What the original lecture would be trimmed to (null = it disappears entirely). */
  before: { startTime: string; endTime: string } | null;
  /** The trailing remainder, created as a new lecture (null = none). */
  after: { startTime: string; endTime: string } | null;
}

export interface ConflictResult {
  kind: "NONE" | "SPLITTABLE" | "BLOCKED";
  split?: ConflictSplit;
  /** Set when kind is BLOCKED — why it can't be auto-resolved. */
  reason?: string;
}

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

/**
 * Checks whether a proposed session (typically a test) overlaps an existing
 * lecture for the same batch on the same date, and whether that lecture can be
 * safely split around it.
 *
 * A lecture is only splittable while it's still "just a plan": no attendance
 * marked and no payroll line item generated. Once either exists, the times are
 * part of a record someone was paid or graded against, so we refuse and make
 * the admin resolve it deliberately — mirroring the existing guard that blocks
 * deleting a lecture with attendance.
 */
export async function checkSessionConflict(input: {
  batchId: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  /** Ignore this lecture when checking (used when rescheduling an existing session). */
  excludeLectureId?: string;
}): Promise<ConflictResult> {
  const proposedStart = minutes(input.startTime);
  const proposedEnd = minutes(input.endTime);

  const sameDay = await prisma.lecture.findMany({
    where: {
      batchId: input.batchId,
      date: input.date,
      cancelledAt: null,
      id: input.excludeLectureId ? { not: input.excludeLectureId } : undefined,
    },
    include: {
      subject: { select: { name: true } },
      faculty: { select: { fullName: true } },
      attendance: { select: { id: true }, take: 1 },
      payrollLineItem: { select: { id: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const overlapping = sameDay.filter((l) => minutes(l.startTime) < proposedEnd && minutes(l.endTime) > proposedStart);
  if (overlapping.length === 0) return { kind: "NONE" };

  if (overlapping.length > 1) {
    return {
      kind: "BLOCKED",
      reason: "This time overlaps more than one scheduled session for this batch — adjust the schedule manually first.",
    };
  }

  const clash = overlapping[0]!;
  const clashLabel = `${clash.subject.name} (${clash.faculty.fullName})`;

  if (clash.attendance.length > 0) {
    return {
      kind: "BLOCKED",
      reason: `This overlaps ${clashLabel}, which already has attendance marked. Edit or cancel that session first.`,
    };
  }
  if (clash.payrollLineItem) {
    return {
      kind: "BLOCKED",
      reason: `This overlaps ${clashLabel}, which has already been counted for payroll. Edit or cancel that session first.`,
    };
  }
  if (clash.kind === "TEST") {
    return {
      kind: "BLOCKED",
      reason: `This overlaps another test for this batch (${clashLabel}). Two tests can't run at the same time.`,
    };
  }

  const clashStart = minutes(clash.startTime);
  const clashEnd = minutes(clash.endTime);

  return {
    kind: "SPLITTABLE",
    split: {
      conflictLectureId: clash.id,
      conflictLabel: `${clashLabel} ${hhmm(clashStart)}–${hhmm(clashEnd)}`,
      before: clashStart < proposedStart ? { startTime: hhmm(clashStart), endTime: hhmm(proposedStart) } : null,
      after: clashEnd > proposedEnd ? { startTime: hhmm(proposedEnd), endTime: hhmm(clashEnd) } : null,
    },
  };
}
