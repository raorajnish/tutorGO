"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { CopyMessageBox } from "@/components/attendance/CopyMessageBox";
import type { TestReport } from "@/lib/types";
import { formatDate } from "@/lib/format";

/** Plain-text summary sized for a WhatsApp message — no markdown tables,
 * since WhatsApp renders them as literal pipes. */
function whatsappSummary(r: TestReport): string {
  const lines = [
    `*${r.test.title}*`,
    `${r.session.batch.name} · ${r.test.subject.name}`,
    `${formatDate(r.session.date)} · Out of ${r.test.totalMarks}`,
    "",
  ];

  for (const row of r.rows) {
    if (!row.present) {
      lines.push(`${row.student.name} — Absent`);
    } else if (row.marksObtained === null) {
      lines.push(`${row.student.name} — Not graded`);
    } else {
      const pass = row.passed === null ? "" : row.passed ? " ✅" : " ❌";
      lines.push(`${row.student.name} — ${Number(row.marksObtained)}/${r.test.totalMarks}${pass}`);
    }
  }

  if (r.summary.graded > 0) {
    lines.push("", `Average: ${r.summary.average}/${r.test.totalMarks}`, `Highest: ${r.summary.highest}`);
    if (r.summary.passed !== null) lines.push(`Passed: ${r.summary.passed}/${r.summary.graded}`);
  }

  return lines.join("\n");
}

export default function TestReportPage({ params }: { params: Promise<{ id: string; lectureId: string }> }) {
  const { id, lectureId } = use(params);
  const [report, setReport] = useState<TestReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TestReport>(`/tests/${id}/sessions/${lectureId}/report`)
      .then(setReport)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this result sheet."));
  }, [id, lectureId]);

  const message = useMemo(() => (report ? whatsappSummary(report) : ""), [report]);

  if (error) {
    return <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>;
  }
  if (!report) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { test, session, rows, summary } = report;

  return (
    <div className="space-y-6">
      {/* print:hidden strips the app chrome so the printed page is just the
          result sheet — the browser's own Save-as-PDF then handles download. */}
      <div className="print:hidden">
        <Link href={`/tests/${id}`} className="text-sm font-medium text-accent hover:opacity-80">
          ← Back to test
        </Link>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Result sheet</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {test.title} · {session.batch.name}
            </p>
          </div>
          <Button onClick={() => window.print()} className="w-full sm:w-auto">
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* The printable sheet itself. */}
      <div className="rounded-xl border border-border bg-card p-5 print:rounded-none print:border-0 print:p-0 sm:p-6">
        <header className="border-b border-border pb-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{report.instituteName}</p>
          <h2 className="font-display mt-1 text-xl font-bold text-foreground">{test.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {test.course.name} · {test.subject.name} · {session.batch.name}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDate(session.date)} · {session.startTime}–{session.endTime} · Invigilator: {session.faculty.fullName}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Total marks: {test.totalMarks}
            {test.passingMarks !== null ? ` · Passing: ${test.passingMarks}` : ""}
          </p>
        </header>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">Code</th>
                <th className="py-2 pr-3 text-right">Marks</th>
                <th className="py-2 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={r.student.id}>
                  <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 pr-3 font-medium text-foreground">{r.student.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.student.studentCode}</td>
                  <td className="py-2 pr-3 text-right text-foreground">
                    {!r.present ? "—" : r.marksObtained === null ? "—" : `${Number(r.marksObtained)}/${test.totalMarks}`}
                  </td>
                  <td className="py-2 text-right">
                    {!r.present ? (
                      <span className="text-danger">Absent</span>
                    ) : r.marksObtained === null ? (
                      <span className="text-muted-foreground">Not graded</span>
                    ) : r.passed === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : r.passed ? (
                      <span className="text-success">Pass</span>
                    ) : (
                      <span className="text-danger">Fail</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Appeared</p>
            <p className="font-display text-lg font-semibold text-foreground">
              {summary.present}/{summary.total}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Average</p>
            <p className="font-display text-lg font-semibold text-foreground">{summary.average ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Highest</p>
            <p className="font-display text-lg font-semibold text-foreground">{summary.highest ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Passed</p>
            <p className="font-display text-lg font-semibold text-foreground">
              {summary.passed === null ? "—" : `${summary.passed}/${summary.graded}`}
            </p>
          </div>
        </div>
      </div>

      <div className="print:hidden">
        <CopyMessageBox message={message} />
      </div>
    </div>
  );
}
