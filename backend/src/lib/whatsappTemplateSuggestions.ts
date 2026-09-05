import type { MessageTemplateType } from "./messageTemplates.js";

/** Meta HSM-shaped drafts derived from the same 5 in-app triggers as
 * messageTemplates.ts — not a second content system. Meta requires fixed
 * wording with numbered placeholders ({{1}}, {{2}}, ...) and pre-approval,
 * so these are suggestions an owner reviews and submits (services/whatsapp.ts
 * submitTemplate), not sent as-is. sampleValues are what Meta's reviewer
 * sees filled in — required for approval, otherwise cosmetic. */
export interface WhatsAppTemplateSuggestion {
  mappedType: MessageTemplateType;
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  bodyText: string;
  sampleValues: string[];
}

export const WHATSAPP_TEMPLATE_SUGGESTIONS: Record<MessageTemplateType, WhatsAppTemplateSuggestion> = {
  LECTURE_SCHEDULED: {
    mappedType: "LECTURE_SCHEDULED",
    name: "lecture_scheduled",
    language: "en",
    category: "UTILITY",
    bodyText: "{{1}} — {{2}} ({{3}}) is scheduled on {{4}} from {{5}} to {{6}}. Faculty: {{7}}.",
    sampleValues: ["Physics", "Batch A", "NEET 2026", "12 Mar", "4:00 PM", "5:30 PM", "Mr. Sharma"],
  },
  LECTURE_CANCELLED: {
    mappedType: "LECTURE_CANCELLED",
    name: "lecture_cancelled",
    language: "en",
    category: "UTILITY",
    bodyText: "The {{1}} lecture for {{2}} ({{3}}) on {{4}} at {{5}} has been cancelled. Reason: {{6}}.",
    sampleValues: ["Physics", "Batch A", "NEET 2026", "12 Mar", "4:00 PM", "Faculty unavailable"],
  },
  ATTENDANCE_MARKED: {
    mappedType: "ATTENDANCE_MARKED",
    name: "attendance_marked",
    language: "en",
    category: "UTILITY",
    bodyText: "Attendance for {{1}} on {{2}}: {{3}} was {{4}}.",
    sampleValues: ["Physics — Batch A", "12 Mar", "Rohan Mehta", "Present"],
  },
  FEE_OVERDUE_REMINDER: {
    mappedType: "FEE_OVERDUE_REMINDER",
    name: "fee_overdue_reminder",
    language: "en",
    category: "UTILITY",
    bodyText: "Dear parent/guardian of {{1}}, a fee installment of Rs. {{2}} for {{3}} was due on {{4}} and is now {{5}} day(s) overdue. Kindly clear the pending amount at the earliest.",
    sampleValues: ["Rohan Mehta", "5,000", "NEET 2026", "1 Mar", "11"],
  },
  PAYROLL_PAYMENT_RECORDED: {
    mappedType: "PAYROLL_PAYMENT_RECORDED",
    name: "payroll_payment_recorded",
    language: "en",
    category: "UTILITY",
    bodyText: "Hi {{1}}, Rs. {{2}} was paid to you via {{3}} on {{4}}. Pending balance: Rs. {{5}}.",
    sampleValues: ["Mr. Sharma", "25,000", "Bank Transfer", "1 Mar", "0"],
  },
  TEST_RESULT_ENTERED: {
    mappedType: "TEST_RESULT_ENTERED",
    name: "test_result_entered",
    language: "en",
    category: "UTILITY",
    bodyText: "{{1}} scored {{2}} out of {{3}} in {{4}} ({{5}}), held on {{6}}.",
    sampleValues: ["Rohan Mehta", "42", "50", "Unit Test 2", "Physics", "12 Mar"],
  },
  PTM_SCHEDULED: {
    mappedType: "PTM_SCHEDULED",
    name: "ptm_scheduled",
    language: "en",
    category: "UTILITY",
    bodyText: "A Parent-Teacher Meeting — {{1}} — for {{2}} ({{3}}) is scheduled on {{4}} from {{5}} to {{6}}.",
    sampleValues: ["Term 1 PTM", "Batch A", "NEET 2026", "12 Mar", "4:00 PM", "5:30 PM"],
  },
  PTM_CANCELLED: {
    mappedType: "PTM_CANCELLED",
    name: "ptm_cancelled",
    language: "en",
    category: "UTILITY",
    bodyText: "The Parent-Teacher Meeting — {{1}} — for {{2}} ({{3}}) on {{4}} has been cancelled. Reason: {{5}}.",
    sampleValues: ["Term 1 PTM", "Batch A", "NEET 2026", "12 Mar", "Faculty unavailable"],
  },
};
