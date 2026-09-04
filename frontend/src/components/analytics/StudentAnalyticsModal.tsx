"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Badge } from "@/components/ui/Badge";
import { Skeleton, SkeletonLine } from "@/components/ui/Skeleton";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { formatDate } from "@/lib/format";
import type { StudentAnalyticsDetail } from "@/lib/types";

interface Props {
  studentId: string | null;
  studentName: string;
  from: string;
  to: string;
  onClose: () => void;
}

export function StudentAnalyticsModal({ studentId, studentName, from, to, onClose }: Props) {
  const [data, setData] = useState<StudentAnalyticsDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    setData(null);
    setError(null);
    setLoading(true);
    apiFetch<StudentAnalyticsDetail>(`/analytics/students/${studentId}?from=${from}&to=${to}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load this student's analytics."))
      .finally(() => setLoading(false));
  }, [studentId, from, to]);

  return (
    <Modal open={!!studentId} onClose={onClose} title={`Analytics — ${studentName}`} width="lg">
      {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-medium text-foreground">Attendance</p>
            <Skeleton loading={loading} className="inline-block w-16">
              <span className="font-display text-base font-semibold text-foreground">{data?.attendance.overallPercent ?? 0}%</span>
            </Skeleton>
          </div>
          <Skeleton loading={loading} rounded="xl">
            <TrendChart data={data?.attendance.trend ?? []} height={180} />
          </Skeleton>

          {!loading && data && data.attendance.bySubject.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {data.attendance.bySubject.map((s) => (
                <Badge key={s.subject.id} tone={s.percent < 75 ? "danger" : "success"}>
                  {s.subject.name}: {s.percent}%
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-medium text-foreground">Test history</p>
            {data?.tests.averagePercent !== null && data?.tests.averagePercent !== undefined && (
              <span className="text-xs text-muted-foreground">Average {data.tests.averagePercent}%</span>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              <SkeletonLine />
              <SkeletonLine />
              <SkeletonLine />
            </div>
          ) : !data || data.tests.history.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
              No tests recorded in this range.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              {data.tests.history.map((t, i) => (
                <div key={t.testId} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.subject} · {formatDate(t.date)}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {t.marksObtained}/{t.totalMarks} ({t.percent}%)
                  </span>
                  {t.passed !== null && <Badge tone={t.passed ? "success" : "danger"}>{t.passed ? "Passed" : "Failed"}</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
