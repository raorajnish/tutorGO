import { prisma } from "../lib/prisma.js";
import { notify } from "./notify.js";
import { sendPush } from "./push.js";
import { dispatchMessage, renderMessageBody } from "./dispatch.js";
import { derivePortalStatus } from "../lib/portalAccess.js";
import type { MessageTemplateType } from "../lib/messageTemplates.js";

/** Where `notificationclick` should land for each event type — without this
 * every push notification opens `/dashboard`, a page a STUDENT login can't
 * even reach. Doubles as the push `tag`, so e.g. a second FEE_OVERDUE_REMINDER
 * before the first is read replaces it instead of stacking a duplicate. */
const PORTAL_ROUTE_FOR_TYPE: Record<MessageTemplateType, string> = {
  LECTURE_SCHEDULED: "/portal/timetable",
  LECTURE_CANCELLED: "/portal/timetable",
  ATTENDANCE_MARKED: "/portal/attendance",
  FEE_OVERDUE_REMINDER: "/portal/fees",
  PAYROLL_PAYMENT_RECORDED: "/portal", // staff-only in practice; never actually dispatched to a student
  TEST_RESULT_ENTERED: "/portal/tests",
  PTM_SCHEDULED: "/portal/timetable",
  PTM_CANCELLED: "/portal/timetable",
};

/**
 * One fan-out for everything a student or their parent should hear about
 * (changes-phase10.md §10.6): fee alerts, test results, lectures scheduled or
 * cancelled, test details.
 *
 * Two channels, one call site:
 *  - **In-app** — a persisted Notification on the student's own portal login,
 *    but only when that login is currently ACTIVE. A student whose course had
 *    the portal switched off can't read notifications, so writing them would
 *    just be filling a table nobody will ever see.
 *  - **WhatsApp** — the parent's number, via the existing dispatcher. This is
 *    the only channel that reaches a parent at all (there is no parent email
 *    field anywhere in the schema), so it runs independently of whether the
 *    student has a portal login.
 *
 * Every event rides a write path that already exists (lecture create/cancel,
 * marks entry, payment/overdue). Nothing here polls or schedules — that stays
 * out of scope, same as the deferred fee-overdue sweep in §10.2.
 *
 * Delivery is best-effort by construction: a failing template or an
 * unreachable WhatsApp API must never roll back the real event that triggered
 * it (marks that were entered, a lecture that was scheduled). Failures are
 * swallowed and reported in the return value rather than thrown.
 */

export interface StudentNotifyResult {
  inApp: "SENT" | "SKIPPED" | "FAILED";
  whatsapp: "SENT" | "FAILED" | "SKIPPED";
}

interface StudentNotifyInput {
  instituteId: string;
  studentId: string;
  type: MessageTemplateType;
  /** Short heading for the in-app feed. The WhatsApp copy uses the institute's
   * own template body instead, so the two channels stay independently
   * customizable. */
  title: string;
  vars: Record<string, string>;
  /** Extra context stored on the Notification for the portal to deep-link
   * with (a test id, an installment id). Never rendered as text. */
  metadata?: Record<string, unknown>;
}

/** The one query both channels need: who the student is, whether their portal
 * login is currently usable, and what number their parent is on. */
async function loadRecipient(studentId: string, instituteId: string) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      instituteId: true,
      name: true,
      isActive: true,
      courseId: true,
      userId: true,
      portalIssuedForCourseId: true,
      parentPhone: true,
      phone: true,
      course: { select: { portalEnabled: true } },
      user: { select: { id: true, isActive: true } },
    },
  });
  if (!student || student.instituteId !== instituteId) return null;
  return student;
}

export async function notifyStudent(input: StudentNotifyInput): Promise<StudentNotifyResult> {
  const student = await loadRecipient(input.studentId, input.instituteId);
  if (!student) return { inApp: "SKIPPED", whatsapp: "SKIPPED" };

  const status = derivePortalStatus({
    courseId: student.courseId,
    userId: student.userId,
    portalIssuedForCourseId: student.portalIssuedForCourseId,
    coursePortalEnabled: student.course.portalEnabled,
    userIsActive: student.user?.isActive ?? null,
  });

  let inApp: StudentNotifyResult["inApp"] = "SKIPPED";
  if (status === "ACTIVE" && student.userId) {
    // Rendered once and reused for both channels — in-app and push must show
    // the same wording, and rendering twice risked the two silently
    // disagreeing if the template lookup behaved differently between calls.
    const body = await renderMessageBody(input.instituteId, input.type, input.vars).catch(() => input.title);

    try {
      await notify({
        instituteId: input.instituteId,
        userId: student.userId,
        type: input.type,
        title: input.title,
        body,
        metadata: input.metadata,
      });
      inApp = "SENT";
    } catch {
      inApp = "FAILED";
    }

    // Paired with notify() rather than a second independent send — every
    // other trigger in the app (org.ts, payroll.ts, reminderScheduler.ts)
    // calls notify()+sendPush() together; this one only ever called notify(),
    // so a student got the in-app row but nothing on their lock screen. Fired
    // regardless of whether the in-app write above succeeded: a push is a
    // nudge to go check the app, and losing it because of an unrelated in-app
    // write failure would be worse than the (rare) duplicate.
    await sendPush({
      userId: student.userId,
      title: input.title,
      body,
      tag: input.type,
      url: PORTAL_ROUTE_FOR_TYPE[input.type],
    }).catch(() => {});
  }

  let whatsapp: StudentNotifyResult["whatsapp"] = "SKIPPED";
  try {
    // Parent's number first — they are the actual customer relationship for
    // most institutes — falling back to the student's own number when no
    // parent number is on file.
    const result = await dispatchMessage(
      input.instituteId,
      input.type,
      student.parentPhone ?? student.phone,
      input.vars,
      student.id
    );
    whatsapp = result.whatsapp;
  } catch {
    whatsapp = "FAILED";
  }

  return { inApp, whatsapp };
}

/**
 * Same fan-out for a whole batch — used when one event concerns everyone in a
 * lecture (scheduled, cancelled). Runs sequentially rather than in parallel:
 * each recipient may send a WhatsApp message, and a batch of sixty firing at
 * once is a good way to get an institute's number rate-limited by Meta.
 *
 * Only students currently in the batch (`leftAt: null`) and active are
 * included — someone who has left doesn't need to hear about its timetable.
 */
export async function notifyBatch(input: {
  instituteId: string;
  batchId: string;
  type: MessageTemplateType;
  title: string;
  /** Per-student vars are rare for batch events, so this takes one shared set
   * and only substitutes the student's own name where the template asks. */
  vars: Record<string, string>;
  metadata?: Record<string, unknown>;
}): Promise<{ notified: number }> {
  const members = await prisma.studentBatch.findMany({
    where: { batchId: input.batchId, leftAt: null, student: { isActive: true } },
    select: { student: { select: { id: true, name: true } } },
  });

  let notified = 0;
  for (const { student } of members) {
    const result = await notifyStudent({
      instituteId: input.instituteId,
      studentId: student.id,
      type: input.type,
      title: input.title,
      vars: { ...input.vars, studentName: student.name },
      metadata: input.metadata,
    });
    if (result.inApp === "SENT" || result.whatsapp === "SENT") notified += 1;
  }

  return { notified };
}
