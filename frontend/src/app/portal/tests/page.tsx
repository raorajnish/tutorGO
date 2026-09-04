"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import { ICONS, IconChip, StaggerGrid, StaggerItem, StaggerList, PortalEmpty, PortalHeader, PortalStat, SectionTitle } from "@/components/portal/PortalPieces";
import { formatDate, fmtTime12 } from "@/lib/format";
import type { PortalTestDetail, PortalTests } from "@/lib/types";

/** What the student is shown when they open a test — upcoming or already
 * marked. Both cases share one sheet because the content is the same paper;
 * only the score block differs. */
interface OpenTest {
  test: PortalTestDetail;
  when: string;
  timing?: string;
  score?: { marksObtained: string | null; remarks: string | null };
}

function TestSheet({ open, onClose }: { open: OpenTest | null; onClose: () => void }) {
  if (!open) return null;
  const { test, score } = open;
  const passed =
    score && score.marksObtained !== null && test.passingMarks !== null
      ? Number(score.marksObtained) >= test.passingMarks
      : null;

  return (
    <Modal open onClose={onClose} title={test.title} description={`${test.subject} · ${open.when}`} width="md">
      <div className="space-y-4">
        {/* Score first when there is one — it's what the student opened this
            for. Upcoming tests lead with the date/time instead. */}
        <div className="rounded-xl bg-primary p-4 text-primary-foreground">
          {score ? (
            <>
              <p className="text-xs text-primary-foreground/70">Your score</p>
              <p className="font-display mt-1 text-3xl font-semibold leading-none">
                {score.marksObtained}
                <span className="text-xl text-primary-foreground/70">/{test.totalMarks}</span>
              </p>
              {passed !== null && (
                <p className="mt-2 text-xs text-primary-foreground/70">
                  {passed ? "Passed" : "Below the pass mark"} · pass mark {test.passingMarks}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-primary-foreground/70">Scheduled</p>
              <p className="font-display mt-1 text-2xl font-semibold leading-none">{open.when}</p>
              {open.timing && <p className="mt-1.5 text-xs text-primary-foreground/70">{open.timing}</p>}
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Total marks</p>
            <p className="font-display mt-1 text-xl font-semibold text-foreground">{test.totalMarks}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Pass mark</p>
            <p className="font-display mt-1 text-xl font-semibold text-foreground">{test.passingMarks ?? "—"}</p>
          </div>
        </div>

        {test.instructions && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">What to prepare</p>
            <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{test.instructions}</p>
          </div>
        )}

        {score?.remarks && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">Teacher&apos;s note</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{score.remarks}</p>
          </div>
        )}

        {test.paperAssetUrl && (
          <a
            href={test.paperAssetUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
          >
            <IconChip>{ICONS.book}</IconChip>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{test.paperAssetName ?? "Question paper"}</p>
              <p className="text-xs text-muted-foreground">Opens in a new tab</p>
            </div>
          </a>
        )}
      </div>
    </Modal>
  );
}

export default function PortalTestsPage() {
  const [data, setData] = useState<PortalTests | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenTest | null>(null);

  useEffect(() => {
    apiFetch<PortalTests>("/portal/tests")
      .then(setData)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load your tests."));
  }, []);

  const scored = (data?.results ?? []).filter((r) => r.marksObtained !== null);
  const averagePercent =
    scored.length === 0
      ? null
      : Math.round(
          (scored.reduce((sum, r) => sum + Number(r.marksObtained) / r.test.totalMarks, 0) / scored.length) * 100
        );
  const best = scored.reduce<(typeof scored)[number] | null>(
    (top, r) =>
      !top || Number(r.marksObtained) / r.test.totalMarks > Number(top.marksObtained) / top.test.totalMarks ? r : top,
    null
  );

  return (
    <div className="space-y-6">
      <PortalHeader eyebrow="My learning" title="Tests" subtitle="Every test you've taken, and what's coming up." />

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {!data ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-28 w-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <>
          <StaggerGrid className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PortalStat
              emphasis
              icon={ICONS.medal}
              label="Average score"
              value={averagePercent === null ? "—" : `${averagePercent}%`}
              sub={`${scored.length} test${scored.length === 1 ? "" : "s"} marked`}
            />
            <PortalStat
              icon={ICONS.medal}
              label="Best result"
              value={best ? `${best.marksObtained}/${best.test.totalMarks}` : "—"}
              sub={best?.test.subject ?? "No results yet"}
            />
            <PortalStat icon={ICONS.clock} label="Upcoming" value={data.upcoming.length} sub="Scheduled tests" />
            <PortalStat icon={ICONS.book} label="Total taken" value={data.results.length} sub="Across all subjects" />
          </StaggerGrid>

          <section>
            <SectionTitle title="Upcoming tests" />
            {data.upcoming.length === 0 ? (
              <PortalEmpty title="No tests scheduled" hint="You'll see the paper details here as soon as one is." />
            ) : (
              <StaggerList>
                {data.upcoming.map((u) => (
                  <StaggerItem key={u.lectureId}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpen({
                          test: u.test,
                          when: formatDate(u.date, { weekday: true }),
                          timing: `${fmtTime12(u.startTime)}–${fmtTime12(u.endTime)}`,
                        })
                      }
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-(--shadow-card) transition-colors hover:bg-secondary"
                    >
                      <IconChip>{ICONS.clock}</IconChip>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{u.test.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {u.test.subject} · {u.test.totalMarks} marks
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium text-foreground">{formatDate(u.date, { year: false })}</p>
                        <p className="text-xs text-muted-foreground">{fmtTime12(u.startTime)}</p>
                      </div>
                    </button>
                  </StaggerItem>
                ))}
              </StaggerList>
            )}
          </section>

          <section>
            <SectionTitle title="Past results" />
            {data.results.length === 0 ? (
              <PortalEmpty title="No results yet" hint="Your marks appear here as soon as they're entered." />
            ) : (
              <StaggerList>
                {data.results.map((r) => {
                  const passed =
                    r.marksObtained !== null && r.test.passingMarks !== null
                      ? Number(r.marksObtained) >= r.test.passingMarks
                      : null;
                  return (
                    <StaggerItem key={r.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setOpen({
                            test: r.test,
                            when: formatDate(r.heldOn),
                            score: { marksObtained: r.marksObtained, remarks: r.remarks },
                          })
                        }
                        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 text-left shadow-(--shadow-card) transition-colors hover:bg-secondary"
                      >
                        <IconChip>{ICONS.medal}</IconChip>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{r.test.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.test.subject} · {formatDate(r.heldOn, { year: false })}
                          </p>
                        </div>
                        {passed !== null && (
                          <Badge tone={passed ? "success" : "danger"}>{passed ? "Pass" : "Fail"}</Badge>
                        )}
                        <p className="font-display shrink-0 text-lg font-semibold text-foreground">
                          {r.marksObtained}
                          <span className="text-sm text-muted-foreground">/{r.test.totalMarks}</span>
                        </p>
                      </button>
                    </StaggerItem>
                  );
                })}
              </StaggerList>
            )}
          </section>
        </>
      )}

      <TestSheet open={open} onClose={() => setOpen(null)} />
    </div>
  );
}
