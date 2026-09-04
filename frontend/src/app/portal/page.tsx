"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { ICONS, IconChip, StaggerGrid, StaggerItem, StaggerList, PortalEmpty, PortalHeader, PortalStat, SectionTitle } from "@/components/portal/PortalPieces";
import { formatDate, fmtTime12 } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { PortalDashboard } from "@/lib/types";

export default function PortalOverviewPage() {
  const [data, setData] = useState<PortalDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PortalDashboard>("/portal/dashboard")
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load your dashboard."));
  }, []);

  if (error) {
    return <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>;
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <SkeletonBlock className="h-16 w-64" />
        <StaggerGrid className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="h-28 w-full" />
          ))}
        </StaggerGrid>
        <SkeletonBlock className="h-36 w-full" />
      </div>
    );
  }

  const next = data.upcoming[0];
  const fees = data.fees;

  return (
    <div className="space-y-6">
      <PortalHeader
        eyebrow={data.student.instituteName}
        title={`Hi, ${data.student.name.split(" ")[0]}`}
        subtitle={`${data.student.course.name} (${data.student.course.code}) · ${data.student.studentCode}`}
      />

      {/* One emphasis tile, three outline tiles — the reference layout, in our
          own tokens. Attendance leads because it's the number a parent opens
          this app to check. */}
      <StaggerGrid className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PortalStat
          emphasis
          icon={ICONS.check}
          label="Attendance"
          value={data.attendance.rate === null ? "—" : `${data.attendance.rate}%`}
          sub={data.attendance.total > 0 ? `${data.attendance.present} of ${data.attendance.total} classes` : "No classes yet"}
        />
        <PortalStat
          icon={ICONS.medal}
          label="Latest result"
          value={
            data.recentResults[0]
              ? `${data.recentResults[0].marksObtained}/${data.recentResults[0].totalMarks}`
              : "—"
          }
          sub={data.recentResults[0]?.subject ?? "No results yet"}
        />
        <PortalStat
          icon={ICONS.book}
          label="Upcoming classes"
          value={data.upcoming.length}
          sub={next ? formatDate(next.date, { weekday: true, year: false }) : "Nothing scheduled"}
        />
        <PortalStat
          icon={ICONS.rupee}
          label="Fee balance"
          value={fees ? formatMoney(fees.balance) : "—"}
          sub={
            !fees
              ? "No fee account"
              : fees.overdueCount > 0
                ? `${fees.overdueCount} installment${fees.overdueCount === 1 ? "" : "s"} overdue`
                : fees.nextDueDate
                  ? `Next due ${formatDate(fees.nextDueDate, { year: false })}`
                  : "Fully paid"
          }
        />
      </StaggerGrid>

      {/* "What's next" hero — the single most useful thing on the screen for a
          student opening this in the morning. */}
      {next && (
        <div className="rounded-xl bg-primary p-5 text-primary-foreground">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <IconChip onDark>{ICONS.clock}</IconChip>
              <span className="text-xs text-primary-foreground/70">
                {next.kind === "TEST" ? "Next test" : "Next class"} · {formatDate(next.date, { weekday: true })}
              </span>
            </div>
            {next.kind === "TEST" && (
              <span className="rounded-full bg-primary-foreground/15 px-2.5 py-0.5 text-xs font-medium">Test</span>
            )}
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="font-display truncate text-2xl font-semibold leading-none">
                {next.kind === "TEST" && next.test ? next.test.title : next.subject}
              </p>
              <p className="mt-1.5 text-xs text-primary-foreground/70">
                {next.kind === "TEST" ? next.subject : next.faculty}
              </p>
            </div>
            <div className="sm:text-right">
              <p className="text-sm font-semibold">
                {fmtTime12(next.startTime)}–{fmtTime12(next.endTime)}
              </p>
              {next.test && (
                <p className="mt-1 text-xs text-primary-foreground/70">{next.test.totalMarks} marks</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle
            title="Coming up"
            action={
              <Link href="/portal/timetable" className="text-xs text-muted-foreground hover:text-foreground">
                Full timetable
              </Link>
            }
          />
          {data.upcoming.length === 0 ? (
            <PortalEmpty title="Nothing scheduled" hint="New classes will show up here as soon as they're added." />
          ) : (
            <StaggerList>
              {data.upcoming.map((l) => (
                <StaggerItem
                  key={l.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-(--shadow-card)"
                >
                  <IconChip>{l.kind === "TEST" ? ICONS.medal : ICONS.book}</IconChip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {l.kind === "TEST" && l.test ? l.test.title : l.subject}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(l.date, { weekday: true, year: false })} · {fmtTime12(l.startTime)} · {l.faculty}
                    </p>
                  </div>
                  {l.kind === "TEST" && <Badge tone="accent">Test</Badge>}
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </section>

        <section>
          <SectionTitle
            title="Recent results"
            action={
              <Link href="/portal/tests" className="text-xs text-muted-foreground hover:text-foreground">
                All tests
              </Link>
            }
          />
          {data.recentResults.length === 0 ? (
            <PortalEmpty title="No results yet" hint="Your marks appear here as soon as they're entered." />
          ) : (
            <StaggerList>
              {data.recentResults.map((r) => (
                <StaggerItem
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-(--shadow-card)"
                >
                  <IconChip>{ICONS.medal}</IconChip>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.subject} · {formatDate(r.enteredAt, { year: false })}
                    </p>
                  </div>
                  <p className="font-display shrink-0 text-lg font-semibold text-foreground">
                    {r.marksObtained}
                    <span className="text-sm text-muted-foreground">/{r.totalMarks}</span>
                  </p>
                </StaggerItem>
              ))}
            </StaggerList>
          )}
        </section>
      </div>
    </div>
  );
}
