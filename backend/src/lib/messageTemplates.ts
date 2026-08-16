export const MESSAGE_TEMPLATE_TYPES = ["LECTURE_SCHEDULED", "LECTURE_CANCELLED", "ATTENDANCE_MARKED"] as const;
export type MessageTemplateType = (typeof MESSAGE_TEMPLATE_TYPES)[number];

export const DEFAULT_MESSAGE_TEMPLATES: Record<MessageTemplateType, string> = {
  LECTURE_SCHEDULED: "{{date}}\n*{{subject}}* — {{batch}} ({{course}})\n{{startTime}}–{{endTime}}\nFaculty: {{faculty}}{{note}}",
  LECTURE_CANCELLED:
    "⚠️ {{date}} — *Lecture Cancelled*\n{{subject}} — {{batch}} ({{course}})\n{{startTime}}–{{endTime}}\n\nReason: {{cancelReason}}",
  ATTENDANCE_MARKED:
    "✅ *Attendance — {{subject}}, {{batch}}*\n{{course}} · {{date}}\nPresent: {{presentCount}}/{{totalCount}}{{lateNames}}{{absentNames}}{{leaveNames}}{{note}}",
};
