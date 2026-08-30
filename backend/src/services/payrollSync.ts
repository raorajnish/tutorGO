import { Prisma } from "../generated/prisma/client.js";
import { todayDateOnly } from "../lib/dateOnly.js";

type Db = Prisma.TransactionClient;

interface Profile {
  id: string;
  userId: string | null;
  salaryType: "FIXED" | "PER_LECTURE";
  monthlyRate: Prisma.Decimal | null;
  perLectureRate: Prisma.Decimal | null;
  isActive: boolean;
  createdAt: Date;
  deactivatedAt: Date | null;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function periodKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_NAMES[m! - 1]} ${y}`;
}

function nextPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m!, 1)); // m is 1-indexed already, so this lands on the next month
  return periodKey(d);
}

/** Every "YYYY-MM" from `from` to `to` inclusive. */
function periodsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    out.push(cur);
    if (cur === to) break;
    cur = nextPeriod(cur);
    if (out.length > 600) break; // sanity guard against a runaway loop
  }
  return out;
}

function daysInPeriod(period: string): number {
  const [y, m] = period.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of this one
}

/** Full monthlyRate for any period entirely before the departure month;
 * pro-rated (days worked / days in month, rounded to the rupee) for the
 * exact period containing `deactivatedAt`. A profile is never active again
 * past that period — syncLineItems never calls this for a later one. */
function fixedAmountFor(profile: Profile, period: string): Prisma.Decimal {
  const rate = profile.monthlyRate!;
  if (!profile.deactivatedAt) return rate;

  const departurePeriod = periodKey(profile.deactivatedAt);
  if (period !== departurePeriod) return rate;

  const totalDays = daysInPeriod(period);
  const activeDays = Math.min(profile.deactivatedAt.getUTCDate(), totalDays);
  return rate.times(activeDays).dividedBy(totalDays).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function generateFixedLineItems(db: Db, profile: Profile, upToPeriod: string) {
  if (!profile.monthlyRate) return;

  const from = periodKey(profile.createdAt);
  const to = upToPeriod < from ? from : upToPeriod;

  const existing = await db.payrollLineItem.findMany({
    where: { salaryProfileId: profile.id, kind: "SALARY" },
    select: { periodMonth: true },
  });
  const have = new Set(existing.map((e) => e.periodMonth));

  for (const period of periodsBetween(from, to)) {
    if (have.has(period)) continue;
    const amount = fixedAmountFor(profile, period);
    const prorated = profile.deactivatedAt && period === periodKey(profile.deactivatedAt);
    await db.payrollLineItem.create({
      data: {
        salaryProfileId: profile.id,
        kind: "SALARY",
        periodMonth: period,
        label: prorated
          ? `Salary — ${periodLabel(period)} (pro-rated, left ${profile.deactivatedAt!.toLocaleDateString("en-IN", { day: "numeric", month: "short" })})`
          : `Salary — ${periodLabel(period)}`,
        amount,
      },
    });
  }
}

async function generateLectureLineItems(db: Db, profile: Profile, upToPeriod: string) {
  if (!profile.userId || !profile.perLectureRate) return;

  const [y, m] = upToPeriod.split("-").map(Number) as [number, number];
  const upTo = new Date(Date.UTC(y, m, 1)); // first day of the month AFTER upToPeriod
  upTo.setUTCDate(upTo.getUTCDate() - 1); // last day of upToPeriod

  let cutoff = todayDateOnly() < upTo ? todayDateOnly() : upTo;
  if (profile.deactivatedAt && profile.deactivatedAt < cutoff) cutoff = profile.deactivatedAt;

  // "Validated" = actually held (not cancelled) and attendance was marked —
  // the working definition flagged in changes.md, since the dev plan doesn't
  // define it precisely.
  const lectures = await db.lecture.findMany({
    where: {
      facultyId: profile.userId,
      cancelledAt: null,
      date: { lte: cutoff },
      payrollLineItem: null,
      attendance: { some: {} },
    },
    include: { subject: { select: { name: true } }, batch: { select: { name: true } } },
    orderBy: { date: "asc" },
  });

  for (const lecture of lectures) {
    const dateLabel = lecture.date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    await db.payrollLineItem.create({
      data: {
        salaryProfileId: profile.id,
        kind: "LECTURE",
        periodMonth: periodKey(lecture.date),
        lectureId: lecture.id,
        label: `${lecture.subject.name} — ${lecture.batch.name} — ${dateLabel}`,
        amount: profile.perLectureRate,
      },
    });
  }
}

/** Consumes unapplied advance credit (allocations with lineItemId: null) into
 * newly-outstanding line items, oldest advance first, oldest line item first.
 * A plain balance transfer within the same payment row — not a new payment. */
async function reconcileAdvances(db: Db, salaryProfileId: string) {
  const advances = await db.payrollPaymentAllocation.findMany({
    where: { lineItemId: null, payment: { salaryProfileId, voidedAt: null } },
    include: { payment: { select: { paidOn: true } } },
    orderBy: { payment: { paidOn: "asc" } },
  });
  if (advances.length === 0) return;

  // Decimal fields can't be compared to each other in a Prisma `where`, so
  // "outstanding" (amount > paidAmount) is filtered in JS after the fetch.
  const allItems = await db.payrollLineItem.findMany({
    where: { salaryProfileId },
    orderBy: [{ periodMonth: "asc" }, { createdAt: "asc" }],
  });
  const openItems = allItems.filter((i) => i.amount.gt(i.paidAmount));

  let itemIdx = 0;
  for (const advance of advances) {
    let advanceLeft = advance.amount;
    if (advanceLeft.lte(0)) continue;

    while (advanceLeft.gt(0) && itemIdx < openItems.length) {
      const item = openItems[itemIdx]!;
      const outstanding = item.amount.minus(item.paidAmount);
      if (outstanding.lte(0)) {
        itemIdx++;
        continue;
      }
      const applied = Prisma.Decimal.min(outstanding, advanceLeft);

      await db.payrollPaymentAllocation.create({
        data: { paymentId: advance.paymentId, lineItemId: item.id, amount: applied },
      });
      await db.payrollLineItem.update({ where: { id: item.id }, data: { paidAmount: { increment: applied } } });

      advanceLeft = advanceLeft.minus(applied);
      item.paidAmount = item.paidAmount.plus(applied);
      if (item.amount.minus(item.paidAmount).lte(0)) itemIdx++;
    }

    if (advanceLeft.lte(0)) {
      await db.payrollPaymentAllocation.delete({ where: { id: advance.id } });
    } else if (!advanceLeft.eq(advance.amount)) {
      await db.payrollPaymentAllocation.update({ where: { id: advance.id }, data: { amount: advanceLeft } });
    }
  }
}

/** Dry-run projection for `GET /payroll/runs/preview` — computes what
 * `syncLineItems` *would* create for `period` without writing anything.
 * Already-generated line items for the period (e.g. from an earlier ledger
 * read) are counted at their real amount; anything not yet generated is
 * projected at the profile's *current* rate, which may differ slightly from
 * what generation would actually snapshot if the rate changes in between —
 * an accepted approximation for a preview number. */
export async function previewPeriod(db: Db, profile: Profile, period: string): Promise<Prisma.Decimal> {
  if (!profile.isActive) return new Prisma.Decimal(0);

  const existing = await db.payrollLineItem.findMany({ where: { salaryProfileId: profile.id, periodMonth: period } });
  const existingTotal = existing.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));

  if (profile.salaryType === "FIXED") {
    if (existing.some((i) => i.kind === "SALARY")) return existingTotal;
    return existingTotal.plus(profile.monthlyRate ?? 0);
  }

  if (!profile.userId || !profile.perLectureRate) return existingTotal;

  const [y, m] = period.split("-").map(Number) as [number, number];
  const upTo = new Date(Date.UTC(y, m, 1));
  upTo.setUTCDate(upTo.getUTCDate() - 1);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const cutoff = todayDateOnly() < upTo ? todayDateOnly() : upTo;

  const uncounted = await db.lecture.count({
    where: {
      facultyId: profile.userId,
      cancelledAt: null,
      date: { gte: from, lte: cutoff },
      payrollLineItem: null,
      attendance: { some: {} },
    },
  });

  return existingTotal.plus(profile.perLectureRate.times(uncounted));
}

/** Lazily brings a salary profile's line items up to date through
 * `upToPeriod` (default: the current month), then reconciles any unapplied
 * advance credit into whatever's newly outstanding. Safe to call on every
 * read — idempotent, only ever creates rows that don't exist yet.
 *
 * An inactive profile still generates through the period containing its
 * `deactivatedAt` (pro-rated for FIXED, day-capped for PER_LECTURE) — the
 * "final settlement" for whatever they actually did before leaving — but
 * never past it. This runs from the staff ledger / my-payslips read path
 * regardless of active status; it's deliberately excluded from run preview/
 * draft creation (§ activeProfiles filters isActive), which only concerns
 * itself with currently-active staff. */
export async function syncLineItems(db: Db, profile: Profile, upToPeriod?: string) {
  const requestedTo = upToPeriod ?? periodKey(new Date());
  const departureCap = !profile.isActive && profile.deactivatedAt ? periodKey(profile.deactivatedAt) : null;
  const to = departureCap && departureCap < requestedTo ? departureCap : requestedTo;

  if (profile.salaryType === "FIXED") {
    await generateFixedLineItems(db, profile, to);
  } else {
    await generateLectureLineItems(db, profile, to);
  }

  await reconcileAdvances(db, profile.id);
}
