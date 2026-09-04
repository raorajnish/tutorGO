"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { FinanceChart } from "@/components/analytics/FinanceChart";
import { formatMoney } from "@/lib/money";
import { todayInput } from "@/lib/format";
import type { Batch, Course, InstituteAnalytics } from "@/lib/types";

function monthsAgoInput(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return todayInput(d);
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

/** Compact table for a "by course" breakdown — used by both Lectures and
 * Tests, which share the exact same two-metric-plus-name shape. */
function BreakdownTable({
  rows,
  columns,
}: {
  rows: { name: string; code?: string; cells: (string | number)[] }[];
  columns: string[];
}) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Nothing in this range yet.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Course</th>
            {columns.map((c) => (
              <th key={c} className="px-4 py-2.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0 hover:bg-muted">
              <td className="px-4 py-2.5 font-medium text-foreground">
                {r.name} {r.code && <span className="font-normal text-muted-foreground">· {r.code}</span>}
              </td>
              {r.cells.map((c, j) => (
                <td key={j} className="px-4 py-2.5 text-foreground">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function InstituteAnalyticsTab() {
  // Empty until mount, not `monthsAgoInput(3)`/`todayInput()` computed inline
  // — those go through Intl with an explicit IST timeZone, and Next's SSR
  // pass runs on the Node server while hydration runs in the browser. If the
  // two environments' ICU data ever disagree even slightly, the date string
  // differs and React logs (and does not fix) a hydration mismatch. Setting
  // the real default in an effect means the very first render is identical
  // on both sides — just empty — and the "now"-dependent value only appears
  // once we're definitely running client-side.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [data, setData] = useState<InstituteAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFrom(monthsAgoInput(3));
    setTo(todayInput());
  }, []);

  // Course list is a static lookup, not filtered by the date range — fetched
  // once rather than on every filter change.
  useEffect(() => {
    apiFetch<Course[]>("/academics/courses?active=true")
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  // The batch filter only makes sense — and only appears — once a course
  // with more than one batch is selected. A single-batch course has nothing
  // to narrow, so showing the control there would just be a second control
  // that always says the same thing as the course one.
  useEffect(() => {
    setBatchId("");
    if (!courseId) {
      setBatches([]);
      return;
    }
    apiFetch<Batch[]>(`/academics/batches?courseId=${courseId}`)
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [courseId]);

  useEffect(() => {
    if (!from || !to) return; // still waiting on the mount effect above
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    if (courseId) params.set("courseId", courseId);
    if (batchId) params.set("batchId", batchId);
    apiFetch<InstituteAnalytics>(`/analytics/institute?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load analytics."))
      .finally(() => setLoading(false));
  }, [from, to, courseId, batchId]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="min-w-[200px] flex-1">
          <Dropdown
            label="Course"
            value={courseId}
            onChange={setCourseId}
            options={[{ value: "", label: "All courses" }, ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))]}
            placeholder="All courses"
          />
        </div>
        {batches.length > 1 && (
          <div className="min-w-[160px] flex-1">
            <Dropdown
              label="Batch"
              value={batchId}
              onChange={setBatchId}
              options={[{ value: "", label: "All batches" }, ...batches.map((b) => ({ value: b.id, label: b.name }))]}
              placeholder="All batches"
            />
          </div>
        )}
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {/* Enrollment */}
      <section className="space-y-4">
        <SectionHeading title="Enrollment" description="Who's actually here, and how fast that's growing." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton loading={loading}>
            <StatCard label="Active students" value={data?.enrollment.totalActive ?? 0} tone="primary" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Admitted in range" value={data?.enrollment.admissionsInRange ?? 0} tone="accent" />
          </Skeleton>
        </div>
        {/* Always mounted, never swapped for a standalone skeleton block —
            recharts' ResponsiveContainer measures via ResizeObserver on
            mount, and a container that gets created fresh right as data
            arrives measures at zero size until some unrelated layout event
            forces a re-measure. Skeleton keeps it in the tree throughout
            and only toggles visibility, so it paints correctly from the
            very first real render. */}
        <Skeleton loading={loading} rounded="xl">
          <TrendChart title="Admissions per week" data={data?.enrollment.admissionsTrend ?? []} />
        </Skeleton>
        {!loading && !courseId && (
          <BreakdownTable
            columns={["Active students"]}
            rows={(data?.enrollment.byCourse ?? []).map((c) => ({
              name: c.course?.name ?? "—",
              code: c.course?.code,
              cells: [c.count],
            }))}
          />
        )}
      </section>

      {/* Lectures */}
      <section className="space-y-4">
        <SectionHeading title="Lectures" description="Volume and reliability of what's actually being taught, by course." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Skeleton loading={loading}>
            <StatCard label="Lectures held" value={data?.lectures.total ?? 0} tone="primary" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Cancelled" value={data?.lectures.cancelled ?? 0} tone="warning" />
          </Skeleton>
        </div>
        {!loading && (
          <BreakdownTable
            columns={["Held", "Cancelled"]}
            rows={(data?.lectures.byCourse ?? []).map((c) => ({
              name: c.course?.name ?? "—",
              code: c.course?.code,
              cells: [c.held, c.cancelled],
            }))}
          />
        )}
      </section>

      {/* Attendance */}
      <section className="space-y-4">
        <SectionHeading title="Attendance" description="Weekly presence rate across every lecture in range." />
        <Skeleton loading={loading} className="max-w-xs">
          <StatCard label="Overall attendance" value={`${data?.attendance.overallPercent ?? 0}%`} tone="success" />
        </Skeleton>
        <Skeleton loading={loading} rounded="xl">
          <TrendChart title="Attendance % by week" data={data?.attendance.trend ?? []} />
        </Skeleton>
      </section>

      {/* Tests */}
      <section className="space-y-4">
        <SectionHeading title="Test performance" description="Average score and pass rate, weighted by how many students actually sat each test." />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton loading={loading}>
            <StatCard label="Tests" value={data?.tests.testCount ?? 0} tone="primary" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Attempts" value={data?.tests.totalAttempts ?? 0} tone="accent" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Average score" value={`${data?.tests.averagePercent ?? 0}%`} tone="success" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Pass rate" value={`${data?.tests.passRate ?? 0}%`} tone="warning" />
          </Skeleton>
        </div>
        {!loading && (
          <BreakdownTable
            columns={["Attempts", "Avg %", "Pass rate"]}
            rows={(data?.tests.byCourse ?? []).map((c) => ({
              name: c.course.name,
              cells: [c.attempts, `${c.averagePercent}%`, `${c.passRate}%`],
            }))}
          />
        )}
      </section>

      {/* Fees */}
      <section className="space-y-4">
        <SectionHeading title="Fees" description="Coverage against what's actually owed, and what's overdue right now." />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton loading={loading}>
            <StatCard label="Total due" value={formatMoney(data?.fees.totalDue ?? "0")} tone="primary" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Total collected" value={formatMoney(data?.fees.totalCollected ?? "0")} tone="success" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Coverage" value={`${data?.fees.coveragePercent ?? 0}%`} tone="accent" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard
              label="Overdue"
              value={`${formatMoney(data?.fees.overdueAmount ?? "0")} (${data?.fees.overdueCount ?? 0})`}
              tone="danger"
            />
          </Skeleton>
        </div>
        <Skeleton loading={loading} rounded="xl">
          <TrendChart
            title="Fees collected per month"
            data={(data?.fees.collectedTrend ?? []).map((p) => ({ label: p.label, value: p.value }))}
          />
        </Skeleton>
      </section>

      {/* Payroll & Expenses */}
      <section className="space-y-4">
        <SectionHeading title="Payroll & expenses" description="What running the institute costs, independent of any course or batch filter above." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton loading={loading}>
            <StatCard label="Payroll (range)" value={formatMoney(data?.payroll.totalInRange ?? "0")} tone="warning" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Payroll paid" value={formatMoney(data?.payroll.paidInRange ?? "0")} tone="success" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Expenses (range)" value={formatMoney(data?.expenses.totalInRange ?? "0")} tone="danger" />
          </Skeleton>
        </div>
        {!loading && data && data.expenses.byCategory.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.expenses.byCategory.map((c, i) => (
              <Badge key={i} tone="neutral">
                {c.category?.name ?? "Uncategorised"}: {formatMoney(c.amount)}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {/* Finance */}
      <section className="space-y-4">
        <SectionHeading title="Finance" description="Fees collected against payroll and expenses paid — a cash view for the range above, not a formal P&L." />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton loading={loading}>
            <StatCard label="Collected" value={formatMoney(data?.finance.collected ?? "0")} tone="success" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Payroll paid" value={formatMoney(data?.finance.payrollPaid ?? "0")} tone="warning" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Expenses paid" value={formatMoney(data?.finance.expensesPaid ?? "0")} tone="danger" />
          </Skeleton>
          <Skeleton loading={loading}>
            <StatCard label="Net" value={formatMoney(data?.finance.net ?? "0")} tone="accent" />
          </Skeleton>
        </div>
        <Skeleton loading={loading} rounded="xl">
          <FinanceChart data={data?.finance.trend ?? []} />
        </Skeleton>
      </section>
    </div>
  );
}
