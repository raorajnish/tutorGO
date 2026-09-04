"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { CopyMessageBox } from "@/components/attendance/CopyMessageBox";
import { ExportButton } from "@/components/ui/ExportButton";
import { formatMoney, parseMoney } from "@/lib/money";
import { renderTemplate, feeOverdueReminderVars } from "@/lib/messageTemplates";
import { resolveMessageTemplate } from "@/lib/useMessageTemplate";
import type { OverdueEntry } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

export function DefaultersTab({ onOpenStudent }: { onOpenStudent: (studentId: string) => void }) {
  const [entries, setEntries] = useState<OverdueEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reminderFor, setReminderFor] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentResult, setSentResult] = useState<{ id: string; text: string } | null>(null);

  function load() {
    apiFetch<OverdueEntry[]>("/fees/overdue")
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load overdue installments."));
  }

  useEffect(load, []);

  async function handleShowReminder(entry: OverdueEntry) {
    setReminderFor(entry.installment.id);
    setReminderMessage(null);
    const body = await resolveMessageTemplate("FEE_OVERDUE_REMINDER");
    setReminderMessage(renderTemplate(body, feeOverdueReminderVars(entry)));
  }

  /** Actually delivers the reminder — the student's portal feed when they have
   * a working login, and the parent's WhatsApp when a template is connected.
   * The copy-to-clipboard button stays alongside it for institutes with
   * neither channel set up. */
  async function handleSendReminder(entry: OverdueEntry) {
    setSendingId(entry.installment.id);
    setSentResult(null);
    try {
      const result = await apiFetch<{ inApp: string; whatsapp: string }>(
        `/fees/overdue/${entry.installment.id}/remind`,
        { method: "POST" }
      );
      const channels = [
        result.inApp === "SENT" ? "portal" : null,
        result.whatsapp === "SENT" ? "WhatsApp" : null,
      ].filter(Boolean);
      setSentResult({
        id: entry.installment.id,
        text: channels.length > 0 ? `Sent via ${channels.join(" and ")}.` : "No channel was available for this student.",
      });
    } catch (err) {
      setSentResult({
        id: entry.installment.id,
        text: err instanceof ApiClientError ? err.message : "Could not send the reminder.",
      });
    } finally {
      setSendingId(null);
    }
  }

  const totalOverdue = (entries ?? []).reduce((sum, e) => sum + parseMoney(e.outstanding), 0);
  const studentCount = new Set((entries ?? []).map((e) => e.student.id)).size;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Overdue amount" value={formatMoney(totalOverdue)} tone="danger" />
        <StatCard label="Overdue installments" value={entries?.length ?? "—"} tone="warning" />
        <StatCard label="Students affected" value={studentCount} tone="primary" />
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="flex justify-end">
        <ExportButton path="/fees/overdue/export.csv" filename="defaulters.csv" title="Export defaulters as CSV" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-4 py-3 font-medium">Due date</th>
                <th className="px-4 py-3 font-medium">Overdue by</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.installment.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3">
                    <button type="button" className="font-medium text-foreground hover:underline" onClick={() => onOpenStudent(e.student.id)}>
                      {e.student.name}
                    </button>
                    <p className="text-xs text-muted-foreground">{e.student.studentCode}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">{e.student.course ? `${e.student.course.name} (${e.student.course.code})` : "—"}</td>
                  <td className="px-4 py-3 text-foreground">{fmtDate(e.installment.dueDate)}</td>
                  <td className="px-4 py-3">
                    <Badge tone="danger">{e.daysOverdue} days</Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground">{formatMoney(e.outstanding)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSendReminder(e)}
                        disabled={sendingId === e.installment.id}
                        className="cursor-pointer rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {sendingId === e.installment.id ? "Sending…" : "Send reminder"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShowReminder(e)}
                        className="cursor-pointer rounded-lg bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/70"
                      >
                        Copy
                      </button>
                    </div>
                    {sentResult?.id === e.installment.id && (
                      <p className="mt-1 text-xs text-muted-foreground">{sentResult.text}</p>
                    )}
                  </td>
                </tr>
              ))}
              {entries && entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No overdue installments. Nice work.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {reminderFor && reminderMessage !== null && (
          <div className="border-t border-border p-4">
            <CopyMessageBox message={reminderMessage} />
          </div>
        )}
      </div>
    </div>
  );
}
