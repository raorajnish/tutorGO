import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { nextReceiptNumber } from "../services/receiptNumber.js";
import { allocateWaterfall } from "../services/waterfallAllocation.js";
import { money } from "../lib/money.js";
import { loadUserRefs } from "../lib/userRefs.js";

export const feesRouter = Router();

feesRouter.use(authenticate, requireInstitute, requireModule("FEES"));

// Recording routine payments / creating accounts: reception can do day-to-day
// work. Editing the shape of a plan (amounts, adding/removing installments,
// waiving, voiding) is a financial correction — OWNER/ADMIN only.
const MANAGE_ROLES = ["OWNER", "ADMIN", "RECEPTION"] as const;
const STRICT_ROLES = ["OWNER", "ADMIN"] as const;

// ---------------------------------------------------------------------------
// Money + date helpers
// ---------------------------------------------------------------------------

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

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
}) {
  return {
    id: inst.id,
    seq: inst.seq,
    dueDate: inst.dueDate,
    originalDueDate: inst.originalDueDate,
    amount: money(inst.amount),
    paidAmount: money(inst.paidAmount),
    waived: inst.waived,
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
  })
  .refine((b) => b.feeStructureId || b.planType, { message: "Either a fee structure or a plan type is required" });

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

    const account = await prisma.$transaction(async (tx) => {
      if (planType === "ONE_TIME") {
        const courseFeeInput = body.courseFee ?? (structure?.courseFee ? Number(structure.courseFee) : undefined);
        if (courseFeeInput === undefined) throw ApiError.badRequest("Course fee is required");

        const courseFee = new Prisma.Decimal(courseFeeInput);
        const discount = new Prisma.Decimal(body.discount ?? 0);
        const finalFee = courseFee.minus(discount);
        if (finalFee.lte(0)) throw ApiError.badRequest("Final fee must be greater than zero");

        let installmentRows: { seq: number; dueDate: Date; amount: Prisma.Decimal }[];
        let installmentCount: number;

        if (body.installments && body.installments.length > 0) {
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

        await tx.feeInstallment.createMany({
          data: installmentRows.map((r) => ({ feeAccountId: created.id, seq: r.seq, dueDate: r.dueDate, amount: r.amount })),
        });

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

feesRouter.get("/accounts/:studentId", async (req, res, next) => {
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

      const inst = await prisma.feeInstallment.findUnique({ where: { id: req.params.id as string } });
      if (!inst || inst.feeAccountId !== account.id) throw ApiError.notFound("Installment not found");
      if (inst.waived || inst.paidAmount.gte(inst.amount)) {
        throw ApiError.badRequest("A paid or waived installment can't be rescheduled");
      }

      const deltaMs = body.dueDate.getTime() - inst.dueDate.getTime();

      await prisma.$transaction(async (tx) => {
        await tx.feeInstallment.update({
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
      });

      const updated = await prisma.feeInstallment.findUnique({ where: { id: inst.id } });
      res.json(serializeInstallment(updated!));
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

      const inst = await prisma.feeInstallment.findUnique({ where: { id: req.params.id as string } });
      if (!inst || inst.feeAccountId !== account.id) throw ApiError.notFound("Installment not found");
      if (inst.waived) throw ApiError.badRequest("A waived installment's amount can't be edited");
      if (inst.paidAmount.gte(inst.amount)) throw ApiError.badRequest("A fully paid installment's amount can't be edited");

      const newAmount = new Prisma.Decimal(body.amount);
      if (newAmount.lt(inst.paidAmount)) {
        throw ApiError.badRequest(`Amount can't be less than what's already been paid on it (₹${money(inst.paidAmount)})`);
      }

      const updated = await prisma.feeInstallment.update({ where: { id: inst.id }, data: { amount: newAmount } });
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

      const last = await prisma.feeInstallment.findFirst({ where: { feeAccountId: account.id }, orderBy: { seq: "desc" } });
      const seq = (last?.seq ?? 0) + 1;

      const created = await prisma.feeInstallment.create({
        data: { feeAccountId: account.id, seq, dueDate: body.dueDate, amount: new Prisma.Decimal(body.amount) },
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

    const inst = await prisma.feeInstallment.findUnique({ where: { id: req.params.id as string } });
    if (!inst || inst.feeAccountId !== account.id) throw ApiError.notFound("Installment not found");
    if (inst.paidAmount.gt(0) || inst.waived) throw ApiError.badRequest("Only an unpaid, non-waived installment can be removed");

    const last = await prisma.feeInstallment.findFirst({ where: { feeAccountId: account.id }, orderBy: { seq: "desc" } });
    if (!last || last.id !== inst.id) throw ApiError.badRequest("Only the last installment in the plan can be removed");

    await prisma.feeInstallment.delete({ where: { id: inst.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

feesRouter.post("/accounts/:studentId/installments/:id/waive", requireRoles(...STRICT_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const account = await loadFeeAccount(req.params.studentId as string, instituteId);

    const inst = await prisma.feeInstallment.findUnique({ where: { id: req.params.id as string } });
    if (!inst || inst.feeAccountId !== account.id) throw ApiError.notFound("Installment not found");

    const updated = await prisma.feeInstallment.update({ where: { id: inst.id }, data: { waived: true } });
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

feesRouter.post("/payments", requireRoles(...MANAGE_ROLES), validateBody(recordPaymentSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof recordPaymentSchema>;
    const instituteId = req.tenantId!;
    const account = await loadFeeAccount(body.studentId, instituteId);

    const installments = await prisma.feeInstallment.findMany({
      where: { feeAccountId: account.id, waived: false },
      orderBy: { seq: "asc" },
    });

    // Waterfall: fill the earliest open installment first, roll any excess
    // into the next one, and so on — this is what lets "pay ₹14,000 against
    // a ₹10,500 installment" correctly close it and carry ₹3,500 forward
    // instead of over-crediting a single installment past its target. Fees
    // rejects any leftover past the last installment (unlike Payroll, which
    // accepts it as a credit — see services/waterfallAllocation.ts).
    const { allocations: rawAllocations, leftover } = allocateWaterfall(
      installments.map((inst) => ({ id: inst.id, outstanding: inst.amount.minus(inst.paidAmount) })),
      new Prisma.Decimal(body.amount)
    );
    const allocations = rawAllocations.map((a) => ({ installmentId: a.id, amount: a.amount }));

    if (allocations.length === 0) throw ApiError.badRequest("Every installment on this plan is already paid");
    if (leftover.gt(0)) {
      const applicable = new Prisma.Decimal(body.amount).minus(leftover);
      throw ApiError.badRequest(
        `Amount exceeds the remaining balance on this plan — only ₹${money(applicable)} of ₹${money(body.amount)} could be applied`
      );
    }

    const paymentId = await prisma.$transaction(async (tx) => {
      const receiptNumber = await nextReceiptNumber(tx, instituteId, body.paidOn);
      const created = await tx.payment.create({
        data: {
          instituteId,
          feeAccountId: account.id,
          amount: new Prisma.Decimal(body.amount),
          mode: body.mode,
          paidOn: body.paidOn,
          receiptNumber,
          notes: body.notes,
          createdByUserId: req.user!.id,
        },
      });

      for (const a of allocations) {
        await tx.paymentAllocation.create({ data: { paymentId: created.id, installmentId: a.installmentId, amount: a.amount } });
        await tx.feeInstallment.update({ where: { id: a.installmentId }, data: { paidAmount: { increment: a.amount } } });
      }

      return created.id;
    });

    const fullPayment = await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    const createdBy = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, fullName: true } });
    res.status(201).json(serializePayment({ ...fullPayment!, createdBy: createdBy ?? null, voidedBy: null }));
  } catch (err) {
    next(err);
  }
});

feesRouter.get("/payments", async (req, res, next) => {
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

feesRouter.get("/payments/:id/receipt", async (req, res, next) => {
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

const voidPaymentSchema = z.object({ reason: z.string().min(1, "A reason is required").max(300) });

feesRouter.post("/payments/:id/void", requireRoles(...STRICT_ROLES), validateBody(voidPaymentSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof voidPaymentSchema>;

    const payment = await prisma.payment.findUnique({ where: { id: req.params.id as string }, include: { allocations: true } });
    if (!payment || payment.instituteId !== instituteId) throw ApiError.notFound("Payment not found");
    if (payment.voidedAt) throw ApiError.badRequest("This payment is already voided");

    const paymentId = await prisma.$transaction(async (tx) => {
      for (const a of payment.allocations) {
        const inst = await tx.feeInstallment.findUnique({ where: { id: a.installmentId } });
        if (inst) {
          const newPaid = Prisma.Decimal.max(0, inst.paidAmount.minus(a.amount));
          await tx.feeInstallment.update({ where: { id: inst.id }, data: { paidAmount: newPaid } });
        }
      }

      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: { voidedAt: new Date(), voidReason: body.reason, voidedByUserId: req.user!.id },
      });
      return updated.id;
    });

    const fullPayment = await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    const userRefs = await loadUserRefs([fullPayment!.createdByUserId, fullPayment!.voidedByUserId]);
    res.json(
      serializePayment({
        ...fullPayment!,
        createdBy: fullPayment!.createdByUserId ? (userRefs.get(fullPayment!.createdByUserId) ?? null) : null,
        voidedBy: fullPayment!.voidedByUserId ? (userRefs.get(fullPayment!.voidedByUserId) ?? null) : null,
      })
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Overdue / defaulters
// ---------------------------------------------------------------------------

feesRouter.get("/overdue", async (req, res, next) => {
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
