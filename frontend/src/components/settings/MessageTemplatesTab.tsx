"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { CopyMessageBox } from "@/components/attendance/CopyMessageBox";
import { renderTemplate } from "@/lib/messageTemplates";
import { MESSAGE_TEMPLATE_TYPES, MESSAGE_TEMPLATE_LABELS, type MessageTemplate, type MessageTemplateType } from "@/lib/types";

const SAMPLE_VARS: Record<MessageTemplateType, Record<string, string>> = {
  LECTURE_SCHEDULED: {
    course: "10th Standard (10)",
    batch: "Batch A",
    subject: "Chemistry",
    faculty: "Rajnish Sharma",
    date: "Tomorrow, 17 Aug",
    startTime: "09:00",
    endTime: "10:00",
    note: "\n\nBring calculators",
  },
  LECTURE_CANCELLED: {
    course: "10th Standard (10)",
    batch: "Batch A",
    subject: "Chemistry",
    date: "Tomorrow, 17 Aug",
    startTime: "09:00",
    endTime: "10:00",
    cancelReason: "Faculty unavailable",
  },
  ATTENDANCE_MARKED: {
    course: "10th Standard (10)",
    batch: "Batch A",
    subject: "Chemistry",
    date: "Today, 16 Aug",
    presentCount: "18",
    totalCount: "20",
    absentCount: "1",
    lateCount: "1",
    leaveCount: "0",
    absentNames: "\n❌ Absent: Aditi Sharma",
    lateNames: "\n⏰ Late: Rohan Verma",
    leaveNames: "\n🟡 Leave: Priya Nair (informed)",
    note: "",
  },
  FEE_OVERDUE_REMINDER: {
    studentName: "Aditi Sharma",
    amount: "3,333.34",
    dueDate: "5 Aug",
    daysOverdue: "11",
    course: "10th Standard (10)",
  },
  PAYROLL_PAYMENT_RECORDED: {
    name: "Rajnish Sharma",
    amount: "5,000.00",
    mode: "Bank transfer",
    paidOn: "16 Aug",
    pendingAmount: "0.00",
    instituteName: "Super20 Academy",
  },
};

const PLACEHOLDER_LEGEND: Record<MessageTemplateType, string[]> = {
  LECTURE_SCHEDULED: ["course", "batch", "subject", "faculty", "date", "startTime", "endTime", "note"],
  LECTURE_CANCELLED: ["course", "batch", "subject", "date", "startTime", "endTime", "cancelReason"],
  ATTENDANCE_MARKED: [
    "course",
    "batch",
    "subject",
    "date",
    "presentCount",
    "totalCount",
    "absentCount",
    "lateCount",
    "leaveCount",
    "absentNames",
    "lateNames",
    "leaveNames",
    "note",
  ],
  FEE_OVERDUE_REMINDER: ["studentName", "amount", "dueDate", "daysOverdue", "course"],
  PAYROLL_PAYMENT_RECORDED: ["name", "amount", "mode", "paidOn", "pendingAmount", "instituteName"],
};

export function MessageTemplatesTab() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyType, setBusyType] = useState<MessageTemplateType | null>(null);

  function load() {
    apiFetch<MessageTemplate[]>("/org/message-templates")
      .then((data) => {
        setTemplates(data);
        setDrafts(Object.fromEntries(data.map((t) => [t.type, t.body])));
      })
      .catch(() => setError("Could not load message templates."));
  }

  useEffect(load, []);

  async function handleSave(type: MessageTemplateType) {
    setBusyType(type);
    setError(null);
    try {
      await apiFetch(`/org/message-templates/${type}`, { method: "PUT", body: JSON.stringify({ body: drafts[type] }) });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save this template.");
    } finally {
      setBusyType(null);
    }
  }

  async function handleReset(type: MessageTemplateType) {
    setBusyType(type);
    setError(null);
    try {
      await apiFetch(`/org/message-templates/${type}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reset this template.");
    } finally {
      setBusyType(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Customize the WhatsApp-ready messages staff can copy after scheduling a lecture, cancelling one, marking
        attendance, or reminding a parent about an overdue fee. Uses WhatsApp&apos;s own formatting —{" "}
        <code>*bold*</code>, <code>_italic_</code>.
      </p>

      {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      {!templates && <p className="text-sm text-muted-foreground">Loading…</p>}

      {templates &&
        MESSAGE_TEMPLATE_TYPES.map((type) => {
          const t = templates.find((x) => x.type === type);
          const draft = drafts[type] ?? "";
          return (
            <div key={type} className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{MESSAGE_TEMPLATE_LABELS[type]}</p>
                {t && !t.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleReset(type)}
                    disabled={busyType === type}
                    className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Reset to default
                  </button>
                )}
              </div>

              <Textarea
                value={draft}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [type]: e.target.value }))}
                rows={4}
                maxLength={2000}
                className="font-mono text-xs"
              />

              <p className="text-xs text-muted-foreground">
                Placeholders: {PLACEHOLDER_LEGEND[type].map((p) => `{{${p}}}`).join("  ")}
              </p>

              <CopyMessageBox message={renderTemplate(draft, SAMPLE_VARS[type])} />

              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  onClick={() => handleSave(type)}
                  disabled={busyType === type || draft === t?.body}
                >
                  {busyType === type ? "Saving…" : "Save template"}
                </Button>
              </div>
            </div>
          );
        })}
    </div>
  );
}
