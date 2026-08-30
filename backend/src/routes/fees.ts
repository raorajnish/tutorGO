import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { nextReceiptNumber } from "../services/receiptNumber.js";
import { money } from "../lib/money.js";
import { loadUserRefs } from "../lib/userRefs.js";
import { auditLog } from "../services/audit.js";
import { todayDateOnly } from "../lib/dateOnly.js";

export const feesRouter = Router();

feesRouter.use(authenticate, requireInstitute, requireModule("FEES"));

// Recording routine payments / creating accounts: reception can do day-to-day
// work. Editing the shape of a plan (amounts, adding/removing installments,
// waiving, voiding) is a financial correction — OWNER/ADMIN only.
const MANAGE_ROLES = ["OWNER", "ADMIN", "RECEPTION"] as const;
const STRICT_ROLES = ["OWNER", "ADMIN"] as const;
// Reads are money data too — plans, balances, receipts, and the defaulter list
// (which carries every student's phone and parentPhone). ACCOUNTANT is added
// on top of MANAGE_ROLES because reporting is exactly their job; FACULTY has
// no business seeing any of it, and previously could see all of it.
const READ_ROLES = ["OWNER", "ADMIN", "RECEPTION", "ACCOUNTANT"] as const;

// ---------------------------------------------------------------------------
// Money + date helpers
// ---------------------------------------------------------------------------

/** Adds `months` to `date`, keeping the day-of-month capped at 28 to dodge Feb/30-day edge cases. */
function addMonthsCapped(date: Date, months: number, day?: number): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const targetDay = Math.min(day ?? date.getUTCDate(), 28);
  d.setUTCDate(targetDay);
  return d;
}

type InstallmentStatus = "PENDING" | "PARTIAL" | "PAID" | "OVERDUE";

function installmentStatus(
  inst: { dueDate: Date; amount: Prisma.Decimal; paidAmount: Prisma.Decimal; waived: boolean },
  today: Date
): InstallmentStatus {
  if (inst.waived || inst.paidAmount.gte(inst.amount)) return "PAID";
  if (inst.paidAmount.gt(0)) return inst.dueDate < today ? "OVERDUE" : "PARTIAL";
  return inst.dueDate < today ? "OVERDUE" : "PENDING";
}

function serializeInstallment(inst: {
  id: string;
  seq: number;
  dueDate: Date;
  originalDueDate: Date | null;
  amount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  waived: boolean;
  adjustedFromPrevious: boolean;
}) {
  return {
    id: inst.id,
    seq: inst.seq,
    dueDate: inst.dueDate,
    originalDueDate: inst.originalDueDate,
    amount: money(inst.amount),
    paidAmount: money(inst.paidAmount),
    waived: inst.waived,
    adjustedFromPrevious: inst.adjustedFromPrevious,
    status: installmentStatus(inst, todayDateOnly()),
  };
}

function serializePayment(p: {
  id: string;
  amount: Prisma.Decimal;
  mode: string;
  paidOn: Date;
  receiptNumber: string;
  notes: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  createdBy: { id: string; fullName: string } | null;
  voidedBy: { id: string; fullName: string } | null;
  allocations: { installmentId: string; amount: Prisma.Decimal; installment: { seq: number } }[];
}) {
  return {
    id: p.id,
    amount: money(p.amount),
    mode: p.mode,
    paidOn: p.paidOn,
    receiptNumber: p.receiptNumber,
    notes: p.notes,
    voided: p.voidedAt !== null,
    voidReason: p.voidReason,
    createdAt: p.createdAt,
    createdByName: p.createdBy?.fullName ?? null,
    voidedByName: p.voidedBy?.fullName ?? null,
    allocations: p.allocations
      .slice()
      .sort((a, b) => a.installment.seq - b.installment.seq)
      .map((a) => ({ installmentId: a.installmentId, installmentSeq: a.installment.seq, amount: money(a.amount) })),
  };
}

const paymentInclude = { allocations: { include: { installment: { select: { seq: true } } } } } as const;

async function loadFeeAccount(studentId: string, instituteId: string) {
  const account = await prisma.feeAccount.findUnique({
    where: { studentId },
    include: { feeStructure: { select: { id: true, name: true } } },
  });
  if (!account || account.instituteId !== instituteId) throw ApiError.notFound("This student has no fee account");
  return account;
}

/**
 * Runs `fn` in a transaction holding an exclusive lock on ONE fee account.
 *
 * Every write in this file is a read-modify-write: read the installments,
 * decide something from what they currently say, then write. Doing the read
 * outside the transaction made all of them racy — two staff acting on the same
 * student at the same moment each decided against a snapshot the other had
 * already invalidated, and the second write silently won.
 *
 * The lock is a single ROW in fee_accounts, so it only ever makes concurrent
 * work on the SAME student wait. Two people recording payments for two
 * students — same batch, same course, same second — never touch the same row
 * and never block each other.
 *
 * Under Read Committed the reads inside `fn` see a fresh snapshot once the
 * lock is held, which is what makes the re-checks meaningful rather than
 * decorative.
 */
async function withFeeAccountLock<T>(
  accountId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM fee_accounts WHERE id = ${accountId} FOR UPDATE`;
    return fn(tx);
  });
}

function accountTotals(installments: { amount: Prisma.Decimal; paidAmount: Prisma.Decimal; waived: boolean }[]) {
  const totalDue = installments.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
  const totalPaid = installments.reduce((sum, i) => sum.plus(i.paidAmount), new Prisma.Decimal(0));
  const totalWaived = installments.reduce((sum, i) => (i.waived ? sum.plus(i.amount.minus(i.paidAmount)) : sum), new Prisma.Decimal(0));
  const balance = totalDue.minus(totalPaid).minus(totalWaived);
  return { totalDue, totalPaid, totalWaived, balance };
}

// ---------------------------------------------------------------------------
// Installment generation
// ---------------------------------------------------------------------------

function generateOneTimeInstallments(finalFee: Prisma.Decimal, count: number, firstDueDate: Date) {
  const base = finalFee.div(count).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const rows: { seq: number; dueDate: Date; amount: Prisma.Decimal }[] = [];
  let allocated = new Prisma.Decimal(0);

  for (let i = 0; i < count; i++) {
    const seq = i + 1;
    const dueDate = addMonthsCapped(firstDueDate, i, firstDueDate.getUTCDate());
    const isLast = seq === count;
    const amount = isLast ? finalFee.minus(allocated) : base;
    allocated = allocated.plus(amount);
    rows.push({ seq, dueDate, amount });
  }
  return rows;
}

function nextRecurringDueDate(lastDueDate: Date, billingDay: number): Date {
  return addMonthsCapped(lastDueDate, 1, billingDay);
}

/** RECURRING accounts don't get their whole plan generated up front — this
 * tops the installment list back up to at least 2 future rows whenever it's
 * read, so a still-active account always shows the "next couple of months"
 * without needing a background scheduler. */
async function ensureRecurringInstallments(account: {
  id: string;
  status: string;
  monthlyAmount: Prisma.Decimal | null;
  billingDay: number | null;
}) {
  if (account.status !== "ACTIVE" || !account.monthlyAmount || !account.billingDay) return;

  const today = todayDateOnly();
  const existing = await prisma.feeInstallment.findMany({
    where: { feeAccountId: account.id },
    orderBy: { seq: "desc" },
    take: 1,
  });
  const future = await prisma.feeInstallment.count({ where: { feeAccountId: account.id, dueDate: { gte: today } } });
  if (future >= 2 || existing.length === 0) return;

  const last = existing[0]!;
  let lastDueDate = last.dueDate;
  let seq = last.seq;
  const toCreate: { feeAccountId: string; seq: number; dueDate: Date; amount: Prisma.Decimal }[] = [];

  while (toCreate.length + future < 2) {
    lastDueDate = nextRecurringDueDate(lastDueDate, account.billingDay);
    seq += 1;
    toCreate.push({ feeAccountId: account.id, seq, dueDate: lastDueDate, amount: account.monthlyAmount });
  }

  if (toCreate.length > 0) {
    await prisma.feeInstallment.createMany({ data: toCreate });
  }
}

// ---------------------------------------------------------------------------
// Fee accounts
// ---------------------------------------------------------------------------

const installmentOverrideSchema = z
  .array(z.object({ dueDate: z.coerce.date(), amount: z.number().positive() }))
  .min(1, "At least one installment is required");

const createAccountSchema = z
  .object({
    studentId: z.string().min(1, "Student is required"),
    feeStructureId: z.string().optional(),
    planType: z.enum(["ONE_TIME", "RECURRING"]).optional(),
    courseFee: z.number().nonnegative().optional(),
    discount: z.number().nonnegative().optional(),
    installmentCount: z.number().int().positive().optional(),
    firstDueDate: z.coerce.date().optional(),
    installments: installmentOverrideSchema.optional(),
    monthlyAmount: z.number().nonnegative().optional(),
    billingDay: z.number().int().min(1).max(28).optional(),
    startDate: z.coerce.date().optional(),
    /// SUBJECT_WISE only: which of the structure's priced subjects this
    /// student is actually taking. Their prices are summed into courseFee.
    subjectIds: z.array(z.string().min(1)).optional(),
  })
  .refine((b) => b.feeStructureId || b.planType, { message: "Either a fee structure or a plan type is required" });

/// Resolves a subject-wise selection into the rows and total a fee account
/// needs. Returns the priced `courseFee` plus one StudentSubject payload per
/// selected subject — complementary (₹0) subjects included, because they drive
/// rosters exactly as much as paid ones do.
///
/// `joinedAt` per subject is copied from the student's *batch* join date, not
/// today (guard B, changes-phase8.md §8c): deriveRoster filters
/// `joinedAt <= date`, so stamping today on a student who joined months ago
/// would erase them from every earlier roster while their AttendanceRecord
/// rows survive. Falls back to the student's admission date when they aren't
/// in a batch yet.
async function resolveSubjectSelection(
  studentId: string,
  admissionDate: Date,
  structureId: string,
  subjectIds: string[]
) {
  const lines = await prisma.feeStructureSubjectLine.findMany({
    where: { feeStructureId: structureId },
    include: { subject: { select: { id: true, name: true } } },
  });

  if (lines.length === 0) {
    throw ApiError.badRequest("This fee structure has no subject pricing set up yet");
  }

  const byId = new Map(lines.map((l) => [l.subjectId, l]));
  const unknown = subjectIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw ApiError.badRequest("One or more selected subjects aren't priced on this fee structure");

  const selected = subjectIds.map((id) => byId.get(id)!);

  // Complementary subjects are included *with* a paid enrollment, not sold on
  // their own — a selection of only ₹0 subjects is a free ride, and almost
  // always a mis-click. A genuine full waiver goes through `discount` instead,
  // which keeps the original price visible on the receipt.
  if (!selected.some((l) => l.amount.gt(0))) {
    throw ApiError.badRequest(
      "Select at least one paid subject — complementary subjects are included with a paid enrollment, not offered on their own."
    );
  }

  const courseFee = selected.reduce((sum, l) => sum.plus(l.amount), new Prisma.Decimal(0));

  const earliestBatch = await prisma.studentBatch.findFirst({
    where: { studentId },
    orderBy: { joinedAt: "asc" },
    select: { joinedAt: true },
  });
  const joinedAt = earliestBatch?.joinedAt ?? admissionDate;

  return {
    courseFee,
    studentSubjects: selected.map((l) => ({ subjectId: l.subjectId, amount: l.amount, joinedAt })),
  };
}

feesRouter.post("/accounts", requireRoles(...MANAGE_ROLES), validateBody(createAccountSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createAccountSchema>;
    const instituteId = req.tenantId!;

    const student = await prisma.student.findUnique({ where: { id: body.studentId } });
    if (!student || student.instituteId !== instituteId) throw ApiError.badRequest("Student not found");

    const existing = await prisma.feeAccount.findUnique({ where: { studentId: body.studentId } });
    if (existing) throw ApiError.conflict("This student already has a fee account");

    let structure: Awaited<ReturnType<typeof prisma.feeStructure.findUnique>> = null;
    if (body.feeStructureId) {
      structure = await prisma.feeStructure.findUnique({ where: { id: body.feeStructureId } });
      if (!structure || structure.instituteId !== instituteId) throw ApiError.badRequest("Fee structure not found");
    }

    const planType = body.planType ?? structure!.planType;

    const course = await prisma.course.findUnique({ where: { id: student.courseId }, select: { feeMode: true } });
    const subjectWise = course?.feeMode === "SUBJECT_WISE";

    // On a subject-wise course the total is derived from the checked subjects,
    // never typed. Accepting a client courseFee would let the stored total
    // contradict the per-subject rows the receipt itemises from.
    let subjectSelection: Awaited<ReturnType<typeof resolveSubjectSelection>> | null = null;
    if (subjectWise) {
      if (planType !== "ONE_TIME") {
        throw ApiError.badRequest("Subject-wise courses use one-time plans — a per-subject monthly rate isn't supported.");
      }
      if (!structure) throw ApiError.badRequest("A fee structure is required for a subject-wise course");
      if (body.courseFee !== undefined) {
        throw ApiError.badRequest("Course fee is calculated from the selected subjects and can't be set directly");
      }
      if (!body.subjectIds || body.subjectIds.length === 0) throw ApiError.badRequest("Select at least one subject");

      subjectSelection = await resolveSubjectSelection(
        student.id,
        student.admissionDate,
        structure.id,
        body.subjectIds
      );
    }

    const account = await prisma.$transaction(async (tx) => {
      if (planType === "ONE_TIME") {
        const courseFeeInput =
          subjectSelection?.courseFee ?? body.courseFee ?? (structure?.courseFee ? Number(structure.courseFee) : undefined);
        if (courseFeeInput === undefined) throw ApiError.badRequest("Course fee is required");

        const courseFee = new Prisma.Decimal(courseFeeInput);
        const discount = new Prisma.Decimal(body.discount ?? 0);
        const finalFee = courseFee.minus(discount);
        if (finalFee.lt(0)) throw ApiError.badRequest("Discount can't be more than the course fee");
        // A ₹0 total is only reachable by discounting the whole fee — a real
        // full waiver, which stays a valid enrollment with its original price
        // still on record. (A ₹0 *selection* was already rejected upstream.)
        if (finalFee.eq(0) && discount.lte(0)) throw ApiError.badRequest("Final fee must be greater than zero");

        let installmentRows: { seq: number; dueDate: Date; amount: Prisma.Decimal }[];
        let installmentCount: number;

        if (finalFee.eq(0)) {
          // Fully waived — there is nothing to collect, so the account exists
          // for its record and its StudentSubject rows, with no schedule.
          installmentCount = 0;
          installmentRows = [];
        } else if (body.installments && body.installments.length > 0) {
          const sum = body.installments.reduce((s, i) => s.plus(new Prisma.Decimal(i.amount)), new Prisma.Decimal(0));
          if (sum.minus(finalFee).abs().gt(0.01)) {
            throw ApiError.badRequest(
              `Installment amounts add up to ₹${money(sum)}, which doesn't match the final fee of ₹${money(finalFee)}`
            );
          }
          installmentCount = body.installments.length;
          installmentRows = body.installments.map((i, idx) => ({
            seq: idx + 1,
            dueDate: i.dueDate,
            amount: new Prisma.Decimal(i.amount),
          }));
        } else {
          const count = body.installmentCount ?? structure?.installmentCount ?? undefined;
          const firstDueDate = body.firstDueDate;
          if (!count) throw ApiError.badRequest("Installment count is required");
          if (!firstDueDate) throw ApiError.badRequest("First due date is required");
          installmentCount = count;
          installmentRows = generateOneTimeInstallments(finalFee, count, firstDueDate);
        }

        const created = await tx.feeAccount.create({
          data: {
            instituteId,
            studentId: body.studentId,
            feeStructureId: structure?.id,
            planType: "ONE_TIME",
            courseFee,
            discount,
            finalFee,
            installmentCount,
          },
        });

        if (installmentRows.length > 0) {
          await tx.feeInstallment.createMany({
            data: installmentRows.map((r) => ({ feeAccountId: created.id, seq: r.seq, dueDate: r.dueDate, amount: r.amount })),
          });
        }

        // Written in the same transaction as the account: these rows are what
        // the student's rosters are derived from, so an account without them
        // would leave the student invisible on every lecture of their course.
        if (subjectSelection) {
          await tx.studentSubject.createMany({
            data: subjectSelection.studentSubjects.map((s) => ({
              studentId: body.studentId,
              subjectId: s.subjectId,
              amount: s.amount,
              joinedAt: s.joinedAt,
            })),
          });
        }

        return created;
      }

      // RECURRING
      const monthlyAmountInput = body.monthlyAmount ?? (structure?.monthlyAmount ? Number(structure.monthlyAmount) : undefined);
      const billingDay = body.billingDay ?? structure?.billingDay ?? undefined;
      const startDate = body.startDate;
      if (monthlyAmountInput === undefined) throw ApiError.badRequest("Monthly amount is required");
      if (!billingDay) throw ApiError.badRequest("Billing day is required");
      if (!startDate) throw ApiError.badRequest("Start date is required");

      const monthlyAmount = new Prisma.Decimal(monthlyAmountInput);

      const created = await tx.feeAccount.create({
        data: {
          instituteId,
          studentId: body.studentId,
          feeStructureId: structure?.id,
          planType: "RECURRING",
          monthlyAmount,
          billingDay,
        },
      });

      const rows = [];
      for (let i = 0; i < 3; i++) {
        rows.push({
          feeAccountId: created.id,
          seq: i + 1,
          dueDate: addMonthsCapped(startDate, i, billingDay),
          amount: monthlyAmount,
        });
      }
      await tx.feeInstallment.createMany({ data: rows });

      return created;
    });

    res.status(201).json({ id: account.id });
  } catch (err) {
    next(err);
  }
});

feesRouter.get("/accounts/:studentId", requireRoles(...READ_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const studentId = req.params.studentId as string;

    const studentRow = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, instituteId: true, name: true, studentCode: true, course: { select: { id: true, name: true, code: true } } },
    });
    if (!studentRow || studentRow.instituteId !== instituteId) throw ApiError.notFound("Student not found");
    const { instituteId: _studentInstituteId, ...student } = studentRow;

    const account = await prisma.feeAccount.findUnique({
      where: { studentId },
      include: { feeStructure: { select: { id: true, name: true } } },
    });

    if (!account) {
      return res.json({ student, account: null });
    }

    await ensureRecurringInstallments(account);

    const installments = await prisma.feeInstallment.findMany({
      where: { feeAccountId: account.id },
      orderBy: { seq: "asc" },
    });

    const payments = await prisma.payment.findMany({
      where: { feeAccountId: account.id },
      include: paymentInclude,
      orderBy: { paidOn: "desc" },
    });
    const userRefs = await loadUserRefs(payments.flatMap((p) => [p.createdByUserId, p.voidedByUserId]));

    const { totalDue, totalPaid, totalWaived, balance } = accountTotals(installments);

    res.json({
      student,
      account: {
        id: account.id,
        studentId: account.studentId,
        planType: account.planType,
        status: account.status,
        feeStructure: account.feeStructure,
        courseFee: money(account.courseFee),
        discount: money(account.discount),
        finalFee: money(account.finalFee),
        installmentCount: account.installmentCount,
        monthlyAmount: money(account.monthlyAmount),
        billingDay: account.billingDay,
        installments: installments.map(serializeInstallment),
        payments: payments.map((p) =>
          serializePayment({
            ...p,
            createdBy: p.createdByUserId ? (userRefs.get(p.createdByUserId) ?? null) : null,
            voidedBy: p.voidedByUserId ? (userRefs.get(p.voidedByUserId) ?? null) : null,
          })
        ),
        totalDue: money(totalDue),
        totalPaid: money(totalPaid),
        totalWaived: money(totalWaived),
        balance: money(balance),
      },
    });
  } catch (err) {
    next(err);
  }
});

feesRouter.post("/accounts/:studentId/close", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const account = await loadFeeAccount(req.params.studentId as string, instituteId);
    if (account.planType !== "RECURRING") throw ApiError.badRequest("Only recurring fee accounts can be closed");

    await prisma.feeAccount.update({ where: { id: account.id }, data: { status: "CLOSED" } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Installment plan editing — reschedule, edit amount, add, remove, waive
// ---------------------------------------------------------------------------

const rescheduleSchema = z.object({ dueDate: z.coerce.date(), cascade: z.boolean().optional() });

feesRouter.patch(
  "/accounts/:studentId/installments/:id/reschedule",
  requireRoles(...MANAGE_ROLES),
  validateBody(rescheduleSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof rescheduleSchema>;
      const account = await loadFeeAccount(req.params.studentId as string, instituteId);

      const updated = await withFeeAccountLock(account.id, async (tx) => {
        const inst = await tx.feeInstallment.findUnique({ where: { id: req.params.id as string } });
        if (!inst || inst.feeAccountId !== account.id) throw ApiError.notFound("Installment not found");
        if (inst.waived || inst.paidAmount.gte(inst.amount)) {
          throw ApiError.badRequest("A paid or waived installment can't be rescheduled");
        }

        const deltaMs = body.dueDate.getTime() - inst.dueDate.getTime();

        // Returned straight from the update — re-reading the row this
        // transaction just wrote would be a needless round trip.
        const moved = await tx.feeInstallment.update({
          where: { id: inst.id },
          data: { dueDate: body.dueDate, originalDueDate: inst.originalDueDate ?? inst.dueDate },
        });

        if (body.cascade && deltaMs !== 0) {
          const later = await tx.feeInstallment.findMany({ where: { feeAccountId: account.id, seq: { gt: inst.seq } } });
          for (const l of later) {
            await tx.feeInstallment.update({
              where: { id: l.id },
              data: {
                dueDate: new Date(l.dueDate.getTime() + deltaMs),
                originalDueDate: l.originalDueDate ?? l.dueDate,
              },
            });
          }
        }

        return moved;
      });

      res.json(serializeInstallment(updated));
    } catch (err) {
      next(err);
    }
  }
);

const revisePricingSchema = z
  .object({
    /// SUBJECT_WISE only — mutually exclusive with courseFee below, since the
    /// total is computed from the selection, never typed, same rule as account
    /// creation.
    subjectIds: z.array(z.string().min(1)).optional(),
    /// FLAT only — the typed-total equivalent of subjectIds, for correcting a
    /// mistyped base fee rather than a wrong subject selection.
    courseFee: z.number().nonnegative().optional(),
    discount: z.number().nonnegative().optional(),
    firstDueDate: z.coerce.date().optional(),
    installmentCount: z.number().int().positive().optional(),
  })
  .refine((b) => b.subjectIds !== undefined || b.courseFee !== undefined || b.discount !== undefined, {
    message: "Nothing to revise — pass subjectIds/courseFee, discount, or both",
  });

/// Correcting an account that was set up wrong — the wrong subjects ticked, or
/// a mistyped discount. Repricing regenerates the schedule from scratch, so it
/// is only ever allowed **before any money has moved**: once a payment exists,
/// finalFee is the figure the allocation waterfall has been working against,
/// and moving it would leave those allocations describing a total that no
/// longer exists. That gate is the same idiom the installment-level edits use
/// one level down (a paid installment can't be edited or rescheduled either).
///
/// This is NOT the way to handle a student dropping a subject in November —
/// that is PATCH /students/:id/subjects/:subjectId, which touches the roster
/// and deliberately leaves the money alone.
feesRouter.patch(
  "/accounts/:studentId/pricing",
  requireRoles(...STRICT_ROLES),
  validateBody(revisePricingSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof revisePricingSchema>;
      const account = await loadFeeAccount(req.params.studentId as string, instituteId);

      if (account.planType !== "ONE_TIME") throw ApiError.badRequest("Only one-time accounts can be repriced");

      const paymentCount = await prisma.payment.count({ where: { feeAccountId: account.id, voidedAt: null } });
      if (paymentCount > 0) {
        throw ApiError.badRequest(
          "A payment has already been recorded on this account, so it can't be repriced. Adjust the remaining installments instead."
        );
      }

      const student = await prisma.student.findUnique({
        where: { id: account.studentId },
        include: { course: { select: { feeMode: true } } },
      });
      if (!student) throw ApiError.notFound("Student not found");

      const subjectWise = student.course.feeMode === "SUBJECT_WISE";
      if (body.subjectIds && !subjectWise) {
        throw ApiError.badRequest("Subject selection only applies to a subject-wise course");
      }
      if (body.courseFee !== undefined && subjectWise) {
        throw ApiError.badRequest("Course fee is calculated from the selected subjects on this course — revise the subject selection instead");
      }

      let selection: Awaited<ReturnType<typeof resolveSubjectSelection>> | null = null;
      if (body.subjectIds) {
        if (!account.feeStructureId) throw ApiError.badRequest("This account has no fee structure to price against");
        selection = await resolveSubjectSelection(
          student.id,
          student.admissionDate,
          account.feeStructureId,
          body.subjectIds
        );
      }

      const courseFee = selection?.courseFee ?? (body.courseFee !== undefined ? new Prisma.Decimal(body.courseFee) : account.courseFee) ?? new Prisma.Decimal(0);
      const discount = new Prisma.Decimal(body.discount ?? Number(account.discount ?? 0));
      const finalFee = courseFee.minus(discount);
      if (finalFee.lt(0)) throw ApiError.badRequest("Discount can't be more than the course fee");

      const count = body.installmentCount ?? account.installmentCount ?? 1;
      // Keep the existing schedule's start date unless the caller moves it, so
      // a pure discount correction doesn't silently shift every due date.
      const firstExisting = await prisma.feeInstallment.findFirst({
        where: { feeAccountId: account.id },
        orderBy: { seq: "asc" },
        select: { dueDate: true },
      });
      const firstDueDate = body.firstDueDate ?? firstExisting?.dueDate ?? todayDateOnly();

      const updated = await withFeeAccountLock(account.id, async (tx) => {
        // Safe to drop and rebuild: no payment exists, so no PaymentAllocation
        // can be pointing at any of these rows.
        await tx.feeInstallment.deleteMany({ where: { feeAccountId: account.id } });

        if (finalFee.gt(0)) {
          const rows = generateOneTimeInstallments(finalFee, count, firstDueDate);
          await tx.feeInstallment.createMany({
            data: rows.map((r) => ({ feeAccountId: account.id, seq: r.seq, dueDate: r.dueDate, amount: r.amount })),
          });
        }

        if (selection) {
          // The selection was wrong from the start, so the old rows are not
          // history worth keeping — unlike a mid-course drop, which preserves
          // them precisely so past rosters stay correct.
          await tx.studentSubject.deleteMany({ where: { studentId: student.id } });
          await tx.studentSubject.createMany({
            data: selection.studentSubjects.map((s) => ({
              studentId: student.id,
              subjectId: s.subjectId,
              amount: s.amount,
              joinedAt: s.joinedAt,
            })),
          });
        }

        return tx.feeAccount.update({
          where: { id: account.id },
          data: {
            courseFee,
            discount,
            finalFee,
            installmentCount: finalFee.gt(0) ? count : 0,
          },
        });
      });

      await auditLog({
        action: "FEE_ACCOUNT_REPRICED",
        instituteId,
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        targetType: "FeeAccount",
        targetId: account.id,
        metadata: { finalFee: money(finalFee) },
      });

      res.json({ id: updated.id, courseFee: money(courseFee), discount: money(discount), finalFee: money(finalFee) });
    } catch (err) {
      next(err);
    }
  }
);

const editAmountSchema = z.object({ amount: z.number().positive() });

feesRouter.patch(
  "/accounts/:studentId/installments/:id/amount",
  requireRoles(...STRICT_ROLES),
  validateBody(editAmountSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof editAmountSchema>;
      const account = await loadFeeAccount(req.params.studentId as string, instituteId);

      const updated = await withFeeAccountLock(account.id, async (tx) => {
        const inst = await tx.feeInstallment.findUnique({ where: { id: req.params.id as string } });
        if (!inst || inst.feeAccountId !== account.id) throw ApiError.notFound("Installment not found");
        if (inst.waived) throw ApiError.badRequest("A waived installment's amount can't be edited");
        if (inst.paidAmount.gte(inst.amount)) throw ApiError.badRequest("A fully paid installment's amount can't be edited");

        const newAmount = new Prisma.Decimal(body.amount);
        if (newAmount.lt(inst.paidAmount)) {
          throw ApiError.badRequest(`Amount can't be less than what's already been paid on it (₹${money(inst.paidAmount)})`);
        }

        return tx.feeInstallment.update({ where: { id: inst.id }, data: { amount: newAmount } });
      });

      res.json(serializeInstallment(updated));
    } catch (err) {
      next(err);
    }
  }
);

const addInstallmentSchema = z.object({ dueDate: z.coerce.date(), amount: z.number().positive() });

feesRouter.post(
  "/accounts/:studentId/installments",
  requireRoles(...STRICT_ROLES),
  validateBody(addInstallmentSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof addInstallmentSchema>;
      const account = await loadFeeAccount(req.params.studentId as string, instituteId);

      // Locked because `seq` is derived from the current maximum: two adds at
      // once would both read the same last row and collide on the
      // (feeAccountId, seq) unique index.
      const created = await withFeeAccountLock(account.id, async (tx) => {
        const last = await tx.feeInstallment.findFirst({ where: { feeAccountId: account.id }, orderBy: { seq: "desc" } });
        const seq = (last?.seq ?? 0) + 1;

        return tx.feeInstallment.create({
          data: { feeAccountId: account.id, seq, dueDate: body.dueDate, amount: new Prisma.Decimal(body.amount) },
        });
      });

      res.status(201).json(serializeInstallment(created));
    } catch (err) {
      next(err);
    }
  }
);

feesRouter.delete("/accounts/:studentId/installments/:id", requireRoles(...STRICT_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const account = await loadFeeAccount(req.params.studentId as string, instituteId);

    await withFeeAccountLock(account.id, async (tx) => {
      const inst = await tx.feeInstallment.findUnique({ where: { id: req.params.id as string } });
      if (!inst || inst.feeAccountId !== account.id) throw ApiError.notFound("Installment not found");
      if (inst.paidAmount.gt(0) || inst.waived) throw ApiError.badRequest("Only an unpaid, non-waived installment can be removed");

      // Both checks have to hold at the moment of the delete, not merely when
      // the page was loaded: a payment landing in between could have put money
      // on this row, and another add could have made it no longer the last.
      const last = await tx.feeInstallment.findFirst({ where: { feeAccountId: account.id }, orderBy: { seq: "desc" } });
      if (!last || last.id !== inst.id) throw ApiError.badRequest("Only the last installment in the plan can be removed");

      await tx.feeInstallment.delete({ where: { id: inst.id } });
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

feesRouter.post("/accounts/:studentId/installments/:id/waive", requireRoles(...STRICT_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const account = await loadFeeAccount(req.params.studentId as string, instituteId);

    const updated = await withFeeAccountLock(account.id, async (tx) => {
      const inst = await tx.feeInstallment.findUnique({ where: { id: req.params.id as string } });
      if (!inst || inst.feeAccountId !== account.id) throw ApiError.notFound("Installment not found");

      return tx.feeInstallment.update({ where: { id: inst.id }, data: { waived: true } });
    });

    res.json(serializeInstallment(updated));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Payments — waterfall allocation across installments in one transaction
// ---------------------------------------------------------------------------

const recordPaymentSchema = z.object({
  studentId: z.string().min(1),
  amount: z.number().positive("Amount must be greater than zero"),
  mode: z.enum(["UPI", "CASH", "CARD", "BANK_TRANSFER", "CHEQUE"]),
  paidOn: z.coerce.date(),
  notes: z.string().max(300).optional(),
});

interface CarryForwardEntry {
  installmentId: string;
  seq: number;
  dueDate: Date;
  amount: string;
  created: boolean;
  removed: boolean;
}

feesRouter.post("/payments", requireRoles(...MANAGE_ROLES), validateBody(recordPaymentSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof recordPaymentSchema>;
    const instituteId = req.tenantId!;
    const account = await loadFeeAccount(body.studentId, instituteId);
    const paymentAmount = new Prisma.Decimal(body.amount);

    // The sharpest case the lock exists for: two clerks saving at the same
    // moment both saw the same open installment, both passed the balance
    // check, and the second `update` overwrote the first — one payment's money
    // vanished from the plan while its Payment row and receipt still existed.
    const { paymentId, carryForward } = await withFeeAccountLock(account.id, async (tx) => {
      const installments = await tx.feeInstallment.findMany({
        where: { feeAccountId: account.id, waived: false },
        orderBy: { seq: "asc" },
      });

      // A payment always targets exactly ONE installment — the earliest open
      // one — and closes it at exactly what was paid, whether that's less or
      // more than its quoted amount. The difference (either direction) shifts
      // onto the installment(s) after it: a shortfall grows the next one (or
      // creates one), an overpayment shrinks later ones (removing any that
      // get fully absorbed). A payment never spans/closes a second installment
      // on its own — see changes-phase8.md §8a.
      const target = installments.find((i) => i.paidAmount.lt(i.amount));
      if (!target) throw ApiError.badRequest("Every installment on this plan is already paid");

      const totalOutstanding = installments.reduce((sum, i) => sum.plus(i.amount.minus(i.paidAmount)), new Prisma.Decimal(0));
      if (paymentAmount.gt(totalOutstanding)) {
        throw ApiError.badRequest(
          `Amount exceeds the remaining balance on this plan — only ₹${money(totalOutstanding)} of ₹${money(paymentAmount)} could be applied`
        );
      }

      const targetOutstanding = target.amount.minus(target.paidAmount);
      const diff = paymentAmount.minus(targetOutstanding); // >0 overpay, <0 shortfall, 0 exact
      const targetNewPaid = target.paidAmount.plus(paymentAmount);
      const later = installments.filter((i) => i.seq > target.seq);

      const receiptNumber = await nextReceiptNumber(tx, instituteId, body.paidOn);
      const created = await tx.payment.create({
        data: {
          instituteId,
          feeAccountId: account.id,
          amount: paymentAmount,
          mode: body.mode,
          paidOn: body.paidOn,
          receiptNumber,
          notes: body.notes,
          createdByUserId: req.user!.id,
        },
      });

      await tx.paymentAllocation.create({ data: { paymentId: created.id, installmentId: target.id, amount: paymentAmount } });
      // Always closes: paidAmount === amount from here on, so it reads
      // "PAID" under the existing derived-status logic, never "PARTIAL".
      await tx.feeInstallment.update({ where: { id: target.id }, data: { paidAmount: targetNewPaid, amount: targetNewPaid } });

      let carryForward: { direction: "shortfall" | "overpay"; amount: string; entries: CarryForwardEntry[] } | null = null;

      if (diff.lt(0)) {
        const shortfall = diff.neg();
        const next = later[0];
        if (next) {
          const updated = await tx.feeInstallment.update({
            where: { id: next.id },
            data: { amount: { increment: shortfall }, adjustedFromPrevious: true },
          });
          carryForward = {
            direction: "shortfall",
            amount: money(shortfall)!,
            entries: [{ installmentId: updated.id, seq: updated.seq, dueDate: updated.dueDate, amount: money(shortfall)!, created: false, removed: false }],
          };
        } else {
          const lastOverall = installments[installments.length - 1]!;
          const billingDay = account.billingDay ?? lastOverall.dueDate.getUTCDate();
          const newDueDate = addMonthsCapped(lastOverall.dueDate, 1, billingDay);
          const createdInst = await tx.feeInstallment.create({
            data: { feeAccountId: account.id, seq: lastOverall.seq + 1, dueDate: newDueDate, amount: shortfall, adjustedFromPrevious: true },
          });
          carryForward = {
            direction: "shortfall",
            amount: money(shortfall)!,
            entries: [{ installmentId: createdInst.id, seq: createdInst.seq, dueDate: createdInst.dueDate, amount: money(shortfall)!, created: true, removed: false }],
          };
        }
      } else if (diff.gt(0)) {
        // The totalOutstanding guard above guarantees `later` has enough
        // combined amount to fully absorb `diff` — never rejects mid-cascade.
        let remaining = diff;
        const entries: CarryForwardEntry[] = [];
        for (const l of later) {
          if (remaining.lte(0)) break;
          // Only the UNPAID part of a later installment can be absorbed — its
          // paidAmount is money already received and must survive untouched.
          // (totalOutstanding above is computed the same way, so the two
          // agree and the cascade still can't run out of room mid-loop.)
          const outstanding = l.amount.minus(l.paidAmount);
          if (outstanding.lte(0)) continue;
          const reducible = Prisma.Decimal.min(remaining, outstanding);
          // Deleting the row would cascade to its PaymentAllocation history
          // (schema.prisma: onDelete: Cascade) and silently break the
          // reconciliation between Payment.amount and its allocations. Only a
          // row that never received money is safe to remove; anything else is
          // decremented to exactly what was already paid.
          if (reducible.gte(outstanding) && l.paidAmount.lte(0)) {
            await tx.feeInstallment.delete({ where: { id: l.id } });
            entries.push({ installmentId: l.id, seq: l.seq, dueDate: l.dueDate, amount: money(reducible)!, created: false, removed: true });
          } else {
            const updated = await tx.feeInstallment.update({
              where: { id: l.id },
              data: { amount: { decrement: reducible }, adjustedFromPrevious: true },
            });
            entries.push({ installmentId: updated.id, seq: updated.seq, dueDate: updated.dueDate, amount: money(reducible)!, created: false, removed: false });
          }
          remaining = remaining.minus(reducible);
        }
        carryForward = { direction: "overpay", amount: money(diff)!, entries };
      }

      return { paymentId: created.id, carryForward };
    });

    const fullPayment = await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    const createdBy = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, fullName: true } });
    res.status(201).json({
      ...serializePayment({ ...fullPayment!, createdBy: createdBy ?? null, voidedBy: null }),
      carryForward,
    });
  } catch (err) {
    next(err);
  }
});

feesRouter.get("/payments", requireRoles(...READ_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

    let feeAccountId: string | undefined;
    if (studentId) {
      const account = await prisma.feeAccount.findUnique({ where: { studentId } });
      if (!account || account.instituteId !== instituteId) return res.json([]);
      feeAccountId = account.id;
    }

    const payments = await prisma.payment.findMany({
      where: {
        instituteId,
        feeAccountId,
        paidOn: from || to ? { gte: from, lte: to } : undefined,
        ...(search
          ? {
              OR: [
                { receiptNumber: { contains: search, mode: "insensitive" } },
                { feeAccount: { student: { name: { contains: search, mode: "insensitive" } } } },
                { feeAccount: { student: { phone: { contains: search, mode: "insensitive" } } } },
                { feeAccount: { student: { parentPhone: { contains: search, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: {
        ...paymentInclude,
        feeAccount: { include: { student: { select: { id: true, name: true, studentCode: true, phone: true } } } },
      },
      orderBy: { paidOn: "desc" },
      take: 200,
    });
    const userRefs = await loadUserRefs(payments.flatMap((p) => [p.createdByUserId, p.voidedByUserId]));

    res.json(
      payments.map((p) => ({
        ...serializePayment({
          ...p,
          createdBy: p.createdByUserId ? (userRefs.get(p.createdByUserId) ?? null) : null,
          voidedBy: p.voidedByUserId ? (userRefs.get(p.voidedByUserId) ?? null) : null,
        }),
        student: p.feeAccount.student,
      }))
    );
  } catch (err) {
    next(err);
  }
});

feesRouter.get("/payments/:id/receipt", requireRoles(...READ_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id as string },
      include: {
        ...paymentInclude,
        feeAccount: {
          include: {
            student: { select: { id: true, name: true, studentCode: true, course: { select: { id: true, name: true, code: true } } } },
            installments: true,
          },
        },
      },
    });
    if (!payment || payment.instituteId !== instituteId) throw ApiError.notFound("Receipt not found");

    const userRefs = await loadUserRefs([payment.createdByUserId, payment.voidedByUserId]);
    const { totalDue, totalPaid, totalWaived, balance } = accountTotals(payment.feeAccount.installments);

    res.json({
      ...serializePayment({
        ...payment,
        createdBy: payment.createdByUserId ? (userRefs.get(payment.createdByUserId) ?? null) : null,
        voidedBy: payment.voidedByUserId ? (userRefs.get(payment.voidedByUserId) ?? null) : null,
      }),
      student: payment.feeAccount.student,
      accountTotals: { totalDue: money(totalDue), totalPaid: money(totalPaid), totalWaived: money(totalWaived), balance: money(balance) },
    });
  } catch (err) {
    next(err);
  }
});

// Disabled for now: a payment's carry-forward settlement (§8a) can grow,
// shrink, create, or delete OTHER installments beyond the one it directly
// allocates to, and none of that is currently reversible — undoing only
// paidAmount would leave the plan's amounts corrupted. Re-enable once
// voiding can cleanly reverse the full settlement, not just the allocation
// (needs a stored snapshot of what each payment changed). See
// changes-phase8.md §8a.
// No validateBody here on purpose: the handler rejects unconditionally, so
// validating first would answer a caller who omitted `reason` with a confusing
// field error instead of the real reason this endpoint is unavailable.
feesRouter.post("/payments/:id/void", requireRoles(...STRICT_ROLES), async (_req, _res, next) => {
  next(ApiError.badRequest("Voiding a payment is temporarily disabled — contact support if this payment needs correcting."));
});

// ---------------------------------------------------------------------------
// Overdue / defaulters
// ---------------------------------------------------------------------------

feesRouter.get("/overdue", requireRoles(...READ_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const today = todayDateOnly();

    const installments = await prisma.feeInstallment.findMany({
      where: {
        waived: false,
        dueDate: { lt: today },
        feeAccount: { instituteId, status: "ACTIVE" },
      },
      include: {
        feeAccount: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                studentCode: true,
                phone: true,
                parentPhone: true,
                course: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    });

    const overdue = installments
      .filter((i) => !i.paidAmount.gte(i.amount))
      .map((i) => {
        const daysOverdue = Math.round((today.getTime() - i.dueDate.getTime()) / 86400000);
        return {
          installment: serializeInstallment(i),
          daysOverdue,
          outstanding: money(i.amount.minus(i.paidAmount)),
          student: i.feeAccount.student,
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    res.json(overdue);
  } catch (err) {
    next(err);
  }
});
