import type { Lecture, OverdueEntry, RosterEntry } from "./types";
import { formatMoney } from "./money";

// WhatsApp's own formatting marks — *bold*, _italic_ — used directly in
// template bodies rather than any markdown/HTML the app would have to
// translate, so what you type in Settings is exactly what appears in the chat.

export function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(d) - startOfDay(today)) / 86400000);

  const dm = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (diffDays === 0) return `Today, ${dm}`;
  if (diffDays === 1) return `Tomorrow, ${dm}`;
  if (diffDays === -1) return `Yesterday, ${dm}`;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

export function lectureScheduledVars(lecture: Lecture): Record<string, string> {
  return {
    course: `${lecture.batch.course.name} (${lecture.batch.course.code})`,
    batch: lecture.batch.name,
    subject: lecture.subject.name,
    faculty: lecture.faculty.fullName,
    date: formatRelativeDate(lecture.date),
    startTime: lecture.startTime,
    endTime: lecture.endTime,
    note: lecture.note ? `\n\n${lecture.note}` : "",
  };
}

export function lectureCancelledVars(lecture: Lecture): Record<string, string> {
  return {
    course: `${lecture.batch.course.name} (${lecture.batch.course.code})`,
    batch: lecture.batch.name,
    subject: lecture.subject.name,
    date: formatRelativeDate(lecture.date),
    startTime: lecture.startTime,
    endTime: lecture.endTime,
    cancelReason: lecture.cancelReason ?? "",
  };
}

export function attendanceMarkedVars(lecture: Lecture, roster: RosterEntry[]): Record<string, string> {
  const present = roster.filter((r) => r.status === "PRESENT" || r.status === "PRESENT_BIOMETRIC").length;
  const late = roster.filter((r) => r.status === "LATE");
  const absent = roster.filter((r) => r.status === "ABSENT");
  const leave = roster.filter((r) => r.status === "LEAVE");

  return {
    course: `${lecture.batch.course.name} (${lecture.batch.course.code})`,
    batch: lecture.batch.name,
    subject: lecture.subject.name,
    date: formatRelativeDate(lecture.date),
    presentCount: String(present),
    totalCount: String(roster.length),
    absentCount: String(absent.length),
    lateCount: String(late.length),
    leaveCount: String(leave.length),
    absentNames: absent.length > 0 ? `\n❌ Absent: ${absent.map((r) => r.student.name).join(", ")}` : "",
    lateNames: late.length > 0 ? `\n⏰ Late: ${late.map((r) => r.student.name).join(", ")}` : "",
    leaveNames: leave.length > 0 ? `\n🟡 Leave: ${leave.map((r) => `${r.student.name} (informed)`).join(", ")}` : "",
    note: lecture.note ? `\n📝 ${lecture.note}` : "",
  };
}

/** Whether attendance is fully recorded for this roster — used to decide
 * which message a "Copy" action should generate (scheduled vs. attendance). */
export function isFullyMarked(roster: RosterEntry[]): boolean {
  return roster.length > 0 && roster.every((r) => r.status !== null);
}

export function payrollPaymentRecordedVars(input: {
  name: string;
  amount: string;
  mode: string;
  paidOn: string;
  pendingAmount: string;
  instituteName: string;
}): Record<string, string> {
  return {
    name: input.name,
    amount: formatMoney(input.amount).replace("₹", ""),
    mode: input.mode,
    paidOn: formatRelativeDate(input.paidOn),
    pendingAmount: formatMoney(input.pendingAmount).replace("₹", ""),
    instituteName: input.instituteName,
  };
}

export function feeOverdueReminderVars(entry: OverdueEntry): Record<string, string> {
  return {
    studentName: entry.student.name,
    amount: formatMoney(entry.outstanding).replace("₹", ""),
    dueDate: formatRelativeDate(entry.installment.dueDate),
    daysOverdue: String(entry.daysOverdue),
    course: entry.student.course ? `${entry.student.course.name} (${entry.student.course.code})` : "",
  };
}
