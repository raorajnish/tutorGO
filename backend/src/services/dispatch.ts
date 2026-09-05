import { prisma } from "../lib/prisma.js";
import { sendTemplateMessage } from "./whatsapp.js";
import { renderTemplate, resolveTemplate, type MessageTemplateType } from "../lib/messageTemplates.js";

/** The order Meta actually received these placeholders in when the template
 * was submitted (services/whatsapp.ts submitTemplate, from the fixed
 * suggestion catalogue in lib/whatsappTemplateSuggestions.ts). A WhatsApp
 * template's {{1}}, {{2}}... carry no names once approved — position is the
 * only thing Meta enforces — so this is the one place that order is allowed
 * to be assumed, and it must stay in sync with that suggestion catalogue. */
const WHATSAPP_PARAM_ORDER: Record<MessageTemplateType, string[]> = {
  LECTURE_SCHEDULED: ["subject", "batch", "course", "date", "startTime", "endTime", "faculty"],
  LECTURE_CANCELLED: ["subject", "batch", "course", "date", "startTime", "cancelReason"],
  ATTENDANCE_MARKED: ["subjectBatch", "date", "studentName", "status"],
  FEE_OVERDUE_REMINDER: ["studentName", "amount", "course", "dueDate", "daysOverdue"],
  PAYROLL_PAYMENT_RECORDED: ["name", "amount", "mode", "paidOn", "pendingAmount"],
  TEST_RESULT_ENTERED: ["studentName", "marksObtained", "totalMarks", "testTitle", "subject", "heldOn"],
  PTM_SCHEDULED: ["title", "batch", "course", "date", "startTime", "endTime"],
  PTM_CANCELLED: ["title", "batch", "course", "date", "cancelReason"],
};

export interface DispatchResult {
  whatsapp: "SENT" | "FAILED" | "SKIPPED";
  /** Reason WhatsApp was skipped — absent when it was attempted. */
  whatsappSkipReason?: string;
}

/**
 * Sends a parent/student-facing template message over WhatsApp when the
 * institute has one connected, enabled, and mapped+approved for `type`.
 *
 * This is deliberately NOT a "WhatsApp with an email/push fallback" — unlike
 * the staff-facing notify()/sendPush() pair, a parent or student has no
 * in-app account and Student carries no email, so there is no other channel
 * to fall back to for this audience. When WhatsApp isn't ready, the caller
 * gets a clear SKIPPED result to log or surface to staff, not a silent no-op
 * and not a crash — a misconfigured template must never take down whatever
 * real event triggered the message (a payment, an overdue sweep, ...).
 */
export async function dispatchMessage(
  instituteId: string,
  type: MessageTemplateType,
  toPhone: string | null,
  vars: Record<string, string>,
  studentId?: string
): Promise<DispatchResult> {
  if (!toPhone) return { whatsapp: "SKIPPED", whatsappSkipReason: "No phone number on file" };

  const config = await prisma.instituteWhatsAppConfig.findUnique({ where: { instituteId } });
  if (!config) return { whatsapp: "SKIPPED", whatsappSkipReason: "WhatsApp not connected" };
  if (!config.isEnabled) return { whatsapp: "SKIPPED", whatsappSkipReason: "WhatsApp switched off" };

  const template = await prisma.whatsAppTemplate.findFirst({
    where: { instituteId, mappedType: type, status: "APPROVED" },
  });
  if (!template) return { whatsapp: "SKIPPED", whatsappSkipReason: `No approved WhatsApp template mapped for ${type}` };

  const order = WHATSAPP_PARAM_ORDER[type];
  const bodyParams = order.map((key) => vars[key] ?? "");

  const result = await sendTemplateMessage({
    instituteId,
    studentId,
    toPhone,
    templateName: template.name,
    language: template.language,
    bodyParams,
  });

  return { whatsapp: result.status };
}

/** Renders the institute's customized (or default) body for `type` — the
 * same substitution used for the email path today (see payroll.ts), exposed
 * here so every dispatch call site shares one implementation instead of
 * re-deriving it. Not sent anywhere by itself; callers decide the channel. */
export async function renderMessageBody(instituteId: string, type: MessageTemplateType, vars: Record<string, string>): Promise<string> {
  const body = await resolveTemplate(instituteId, type);
  return renderTemplate(body, vars);
}
