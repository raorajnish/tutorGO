import { z } from "zod";
import { prisma } from "./prisma.js";
import { ApiError } from "./http.js";

/// Attendance statuses that mean "this student was actually in the room" —
/// the gate for entering test marks (marks for an absentee are always a
/// data-entry mistake).
export const PRESENT_STATUSES = ["PRESENT", "PRESENT_BIOMETRIC", "LATE"] as const;

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:mm format");

/** @db.Time columns round-trip as a Date pinned to 1970-01-01 UTC. */
export function toTimeDate(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m));
}

export function toTimeString(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export const lectureInclude = {
  batch: { include: { course: { select: { id: true, name: true, code: true } } } },
  subject: { select: { id: true, name: true, shortCode: true } },
  faculty: { select: { id: true, fullName: true } },
  test: { select: { id: true, title: true, totalMarks: true } },
} as const;

export function serializeLecture(l: {
  id: string;
  kind: string;
  testId: string | null;
  date: Date;
  startTime: Date;
  endTime: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  note: string | null;
  batch: { id: string; name: string; course: { id: string; name: string; code: string } };
  subject: { id: string; name: string; shortCode: string };
  faculty: { id: string; fullName: string };
  test?: { id: string; title: string; totalMarks: number } | null;
}) {
  return {
    id: l.id,
    kind: l.kind,
    testId: l.testId,
    testTitle: l.test?.title ?? null,
    date: l.date,
    startTime: toTimeString(l.startTime),
    endTime: toTimeString(l.endTime),
    cancelled: l.cancelledAt !== null,
    cancelReason: l.cancelReason,
    note: l.note,
    batch: { id: l.batch.id, name: l.batch.name, course: l.batch.course },
    subject: { id: l.subject.id, name: l.subject.name, shortCode: l.subject.shortCode },
    faculty: l.faculty,
  };
}

/// The roster is derived per-read from StudentBatch rows active on `date`, so
/// it never goes stale when a student is later moved between batches.
export async function deriveRoster(batchId: string, date: Date) {
  const rows = await prisma.studentBatch.findMany({
    where: {
      batchId,
      joinedAt: { lte: date },
      OR: [{ leftAt: null }, { leftAt: { gte: date } }],
    },
    include: { student: { select: { id: true, name: true, studentCode: true } } },
    orderBy: { student: { name: "asc" } },
  });
  return rows.map((r) => r.student);
}

export function assertCanActOnLecture(req: { user?: { role: string; id: string } }, facultyId: string) {
  if (req.user!.role === "FACULTY" && facultyId !== req.user!.id) {
    throw ApiError.forbidden("You can only manage your own sessions");
  }
}
