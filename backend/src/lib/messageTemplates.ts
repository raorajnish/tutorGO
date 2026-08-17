import { prisma } from "./prisma.js";

export const MESSAGE_TEMPLATE_TYPES = [
  "LECTURE_SCHEDULED",
  "LECTURE_CANCELLED",
  "ATTENDANCE_MARKED",
  "FEE_OVERDUE_REMINDER",
  "PAYROLL_PAYMENT_RECORDED",
] as const;
export type MessageTemplateType = (typeof MESSAGE_TEMPLATE_TYPES)[number];

export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateType, string> = {
  LECTURE_SCHEDULED: "{{date}}\n*{{subject}}* — {{batch}} ({{course}})\n{{startTime}}–{{endTime}}\nFaculty: {{faculty}}{{note}}",
  LECTURE_CANCELLED:
    "⚠️ {{date}} — *Lecture Cancelled*\n{{subject}} — {{batch}} ({{course}})\n{{startTime}}–{{endTime}}\n\nReason: {{cancelReason}}",
  ATTENDANCE_MARKED:
    "✅ *Attendance — {{subject}}, {{batch}}*\n{{course}} · {{date}}\nPresent: {{presentCount}}/{{totalCount}}{{lateNames}}{{absentNames}}{{leaveNames}}{{note}}",
  FEE_OVERDUE_REMINDER:
    "Dear parent/guardian of *{{studentName}}*,\n\nA fee installment of *₹{{amount}}* for {{course}} was due on {{dueDate}} and is now {{daysOverdue}} day(s) overdue.\n\nKindly clear the pending amount at the earliest. Contact us for any queries.\n\nThank you.",
  PAYROLL_PAYMENT_RECORDED:
    "💰 *Payment recorded*\nHi {{name}}, ₹{{amount}} was paid to you via {{mode}} on {{paidOn}}.\n\nPending balance: ₹{{pendingAmount}}\n\n— {{instituteName}}",
};

/** Server-side twin of the frontend's renderTemplate (frontend/src/lib/
 * messageTemplates.ts) — same plain {{key}} substitution, needed here for
 * event-triggered notifications/emails that render without a browser. */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => vars[key] ?? match);
}

/** Resolves an institute's customized template body, or the built-in
 * default if they never touched it in Settings — same fallback rule as
 * GET /org/message-templates, just usable from a non-request context. */
export async function resolveTemplate(instituteId: string, type: MessageTemplateType): Promise<string> {
  const row = await prisma.messageTemplate.findUnique({ where: { instituteId_type: { instituteId, type } } });
  return row?.body ?? DEFAULT_MESSAGE_TEMPLATES[type];
}
