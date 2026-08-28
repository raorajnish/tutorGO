"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";

/** No layout.tsx here on purpose — this is a print target opened via
 * window.open() from SelfFillTab, staff-only (the API call behind it is
 * authenticated and module-gated, so an unauthenticated visitor just sees an
 * error, not real data). Kept outside students/ specifically so it doesn't
 * inherit that route's sidebar shell — a page meant to be printed shouldn't
 * carry navigation chrome. See changes-phase8.md §8f. */

interface RosterResponse {
  course: string | null;
  batch: string | null;
  students: { name: string; studentCode: string; selfFillPin: string }[];
}

export default function RosterPrintPage() {
  return (
    <Suspense fallback={null}>
      <RosterPrintContent />
    </Suspense>
  );
}

function RosterPrintContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    const courseId = searchParams.get("courseId");
    const batchId = searchParams.get("batchId");
    if (courseId) params.set("courseId", courseId);
    if (batchId) params.set("batchId", batchId);

    apiFetch<RosterResponse>(`/students/roster?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load the roster."));
  }, [searchParams]);

  if (error) {
    return <div className="p-8 text-center text-sm text-red-600">{error}</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6 text-black print:p-0">
      <style>{`
        @media print {
          @page { margin: 16mm; }
          .no-print { display: none; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      <h1 className="text-xl font-bold">Admission Roster</h1>
      <p className="mt-1 text-sm text-gray-600">
        {[data.course, data.batch].filter(Boolean).join(" · ") || "All students"} · {data.students.length} pending
      </p>
      <p className="mt-2 text-xs text-gray-500">
        Share the Student ID + code below with each student. They&apos;ll enter both at the admission link to fill in their own
        details.
      </p>

      {/* Screen: scrolls horizontally rather than overflowing the viewport if
          opened on a narrow phone. Print: the overflow wrapper is irrelevant
          to paper output, so no print-specific override is needed. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">Name</th>
              <th className="py-1.5 pr-2">Student ID</th>
              <th className="py-1.5">Code</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s, i) => (
              <tr key={s.studentCode} className="border-b border-gray-300">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2">{s.name}</td>
                <td className="py-1.5 pr-2 font-mono">{s.studentCode}</td>
                <td className="py-1.5 font-mono">{s.selfFillPin}</td>
              </tr>
            ))}
            {data.students.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-500">
                  No students pending self-fill for this selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
