import { Router, type Request } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { money } from "../lib/money.js";
import { toCsv } from "../lib/csv.js";

export const expensesRouter = Router();

expensesRouter.use(authenticate, requireInstitute, requireModule("EXPENSE"));

const MANAGE_ROLES = ["OWNER", "ADMIN"] as const;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
});

expensesRouter.get("/categories", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: { instituteId: req.tenantId! },
      orderBy: { name: "asc" },
    });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

expensesRouter.post("/categories", requireRoles(...MANAGE_ROLES), validateBody(categorySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof categorySchema>;
    const instituteId = req.tenantId!;

    const existing = await prisma.expenseCategory.findUnique({ where: { instituteId_name: { instituteId, name: body.name } } });
    if (existing) throw ApiError.conflict("A category with this name already exists");

    const created = await prisma.expenseCategory.create({ data: { instituteId, name: body.name, kind: body.kind } });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const updateCategorySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  kind: z.enum(["EXPENSE", "INCOME"]).optional(),
  isActive: z.boolean().optional(),
});

expensesRouter.patch("/categories/:id", requireRoles(...MANAGE_ROLES), validateBody(updateCategorySchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const category = await prisma.expenseCategory.findUnique({ where: { id: req.params.id as string } });
    if (!category || category.instituteId !== instituteId) throw ApiError.notFound("Category not found");

    const updated = await prisma.expenseCategory.update({
      where: { id: category.id },
      data: req.body as z.infer<typeof updateCategorySchema>,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// No hard delete — categories may already be referenced by expenses, and
// deactivating (not deleting) keeps historical expenses' category readable.
expensesRouter.delete("/categories/:id", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const category = await prisma.expenseCategory.findUnique({ where: { id: req.params.id as string } });
    if (!category || category.instituteId !== instituteId) throw ApiError.notFound("Category not found");

    await prisma.expenseCategory.update({ where: { id: category.id }, data: { isActive: false } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const eventSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(500).optional(),
});

expensesRouter.get("/events", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const events = await prisma.event.findMany({ where: { instituteId: req.tenantId! }, orderBy: { createdAt: "desc" } });
    res.json(events);
  } catch (err) {
    next(err);
  }
});

expensesRouter.post("/events", requireRoles(...MANAGE_ROLES), validateBody(eventSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof eventSchema>;
    const created = await prisma.event.create({ data: { instituteId: req.tenantId!, name: body.name, notes: body.notes } });
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});


// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

function serializeExpense(e: {
  id: string;
  title: string;
  amount: Prisma.Decimal;
  date: Date;
  mode: string;
  referenceNo: string | null;
  notes: string | null;
  createdAt: Date;
  category: { id: string; name: string };
  event: { id: string; name: string } | null;
  createdBy: { id: string; fullName: string } | null;
}) {
  return {
    id: e.id,
    title: e.title,
    amount: money(e.amount),
    date: e.date,
    mode: e.mode,
    referenceNo: e.referenceNo,
    notes: e.notes,
    category: e.category,
    event: e.event,
    createdByName: e.createdBy?.fullName ?? null,
    createdAt: e.createdAt,
  };
}

const expenseSchema = z
  .object({
    title: z.string().min(1).max(150),
    categoryId: z.string().min(1),
    eventId: z.string().min(1).optional(),
    amount: z.number().positive("Amount must be greater than zero"),
    date: z.coerce.date(),
    mode: z.enum(["UPI", "CASH", "CARD", "BANK_TRANSFER", "CHEQUE"]),
    referenceNo: z.string().max(80).optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((b) => b.mode === "CASH" || !!b.referenceNo?.trim(), {
    message: "A reference number is required for non-cash payment modes",
    path: ["referenceNo"],
  });

expensesRouter.get("/", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    const categoryId = typeof req.query.categoryId === "string" ? req.query.categoryId : undefined;
    const eventId = typeof req.query.eventId === "string" ? req.query.eventId : undefined;

    const expenses = await prisma.expense.findMany({
      where: {
        instituteId,
        categoryId,
        eventId,
        date: from || to ? { gte: from, lte: to } : undefined,
      },
      include: {
        category: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { date: "desc" },
    });

    res.json(expenses.map(serializeExpense));
  } catch (err) {
    next(err);
  }
});

async function upsertFinanceEntry(tx: Prisma.TransactionClient, expense: { id: string; instituteId: string; title: string; amount: Prisma.Decimal; date: Date; category: { name: string } }) {
  await tx.financeEntry.upsert({
    where: { expenseId: expense.id },
    create: {
      instituteId: expense.instituteId,
      kind: "EXPENSE",
      sourceType: "EXPENSE",
      sourceId: expense.id,
      amount: expense.amount,
      date: expense.date,
      description: `${expense.title} (${expense.category.name})`,
      expenseId: expense.id,
    },
    update: {
      amount: expense.amount,
      date: expense.date,
      description: `${expense.title} (${expense.category.name})`,
    },
  });
}

expensesRouter.post("/", requireRoles(...MANAGE_ROLES), validateBody(expenseSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof expenseSchema>;
    const instituteId = req.tenantId!;

    const category = await prisma.expenseCategory.findUnique({ where: { id: body.categoryId } });
    if (!category || category.instituteId !== instituteId) throw ApiError.badRequest("Category not found");

    if (body.eventId) {
      const event = await prisma.event.findUnique({ where: { id: body.eventId } });
      if (!event || event.instituteId !== instituteId) throw ApiError.badRequest("Event not found");
    }

    const expenseId = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          instituteId,
          categoryId: body.categoryId,
          eventId: body.eventId,
          title: body.title,
          amount: new Prisma.Decimal(body.amount),
          date: body.date,
          mode: body.mode,
          referenceNo: body.mode === "CASH" ? undefined : body.referenceNo,
          notes: body.notes,
          createdByUserId: req.user!.id,
        },
      });
      await upsertFinanceEntry(tx, { ...created, category });
      return created.id;
    });

    const full = await prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: {
        category: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    res.status(201).json(serializeExpense(full));
  } catch (err) {
    next(err);
  }
});

const updateExpenseSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    categoryId: z.string().min(1).optional(),
    eventId: z.string().min(1).nullable().optional(),
    amount: z.number().positive().optional(),
    date: z.coerce.date().optional(),
    mode: z.enum(["UPI", "CASH", "CARD", "BANK_TRANSFER", "CHEQUE"]).optional(),
    referenceNo: z.string().max(80).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((b) => !(b.mode && b.mode !== "CASH" && b.referenceNo === null), {
    message: "A reference number is required for non-cash payment modes",
    path: ["referenceNo"],
  });

async function loadExpense(id: string, instituteId: string) {
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } } },
  });
  if (!expense || expense.instituteId !== instituteId) throw ApiError.notFound("Expense not found");
  return expense;
}

expensesRouter.patch("/:id", requireRoles(...MANAGE_ROLES), validateBody(updateExpenseSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateExpenseSchema>;
    const expense = await loadExpense(req.params.id as string, instituteId);

    if (body.categoryId) {
      const category = await prisma.expenseCategory.findUnique({ where: { id: body.categoryId } });
      if (!category || category.instituteId !== instituteId) throw ApiError.badRequest("Category not found");
    }
    if (body.eventId) {
      const event = await prisma.event.findUnique({ where: { id: body.eventId } });
      if (!event || event.instituteId !== instituteId) throw ApiError.badRequest("Event not found");
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id: expense.id },
        data: {
          title: body.title,
          categoryId: body.categoryId,
          eventId: body.eventId,
          amount: body.amount !== undefined ? new Prisma.Decimal(body.amount) : undefined,
          date: body.date,
          mode: body.mode,
          referenceNo: body.mode === "CASH" ? null : body.referenceNo,
          notes: body.notes,
        },
        include: { category: { select: { id: true, name: true } } },
      });
      await upsertFinanceEntry(tx, updated);
    });

    const full = await prisma.expense.findUniqueOrThrow({
      where: { id: expense.id },
      include: {
        category: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    res.json(serializeExpense(full));
  } catch (err) {
    next(err);
  }
});

expensesRouter.delete("/:id", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const expense = await loadExpense(req.params.id as string, req.tenantId!);
    await prisma.$transaction([
      prisma.financeEntry.deleteMany({ where: { expenseId: expense.id } }),
      prisma.expense.delete({ where: { id: expense.id } }),
    ]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Combined ledger (§2.13) — merges expenses (via FinanceEntry), fee payments,
// and payroll payments for one date range into a single chronological feed.
// ---------------------------------------------------------------------------

interface LedgerEntry {
  id: string;
  kind: "INCOME" | "EXPENSE" | "PAYROLL";
  date: Date;
  description: string;
  amount: string;
}

async function buildLedger(instituteId: string, from?: Date, to?: Date): Promise<{ entries: LedgerEntry[]; summary: { income: string; expense: string; payroll: string; net: string } }> {
  const dateFilter = from || to ? { gte: from, lte: to } : undefined;

  const [expenseEntries, payments, payrollPayments] = await Promise.all([
    prisma.financeEntry.findMany({ where: { instituteId, kind: "EXPENSE", date: dateFilter } }),
    prisma.payment.findMany({
      where: { instituteId, voidedAt: null, paidOn: dateFilter },
      include: { feeAccount: { include: { student: { select: { name: true } } } } },
    }),
    prisma.payrollPayment.findMany({
      where: { instituteId, voidedAt: null, paidOn: dateFilter },
      include: { salaryProfile: { include: { user: { select: { fullName: true } } } } },
    }),
  ]);

  const entries: LedgerEntry[] = [
    ...expenseEntries.map((e) => ({ id: e.id, kind: "EXPENSE" as const, date: e.date, description: e.description, amount: money(e.amount)! })),
    ...payments.map((p) => ({
      id: p.id,
      kind: "INCOME" as const,
      date: p.paidOn,
      description: `Fee payment — ${p.feeAccount.student.name} (Receipt ${p.receiptNumber})`,
      amount: money(p.amount)!,
    })),
    ...payrollPayments.map((p) => ({
      id: p.id,
      kind: "PAYROLL" as const,
      date: p.paidOn,
      description: `Payroll — ${p.salaryProfile.user?.fullName ?? p.salaryProfile.externalName ?? "Staff"}`,
      amount: money(p.amount)!,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const sum = (kind: LedgerEntry["kind"]) =>
    entries.filter((e) => e.kind === kind).reduce((s, e) => s.plus(e.amount), new Prisma.Decimal(0));
  const income = sum("INCOME");
  const expense = sum("EXPENSE");
  const payroll = sum("PAYROLL");

  return {
    entries,
    summary: {
      income: money(income)!,
      expense: money(expense)!,
      payroll: money(payroll)!,
      net: money(income.minus(expense).minus(payroll))!,
    },
  };
}

/** `?from=`/`?to=` are shared by the ledger view and its CSV export — both
 * filter the same date range, just render it differently. */
function parseDateRange(req: Request): { from?: Date; to?: Date } {
  return {
    from: typeof req.query.from === "string" ? new Date(req.query.from) : undefined,
    to: typeof req.query.to === "string" ? new Date(req.query.to) : undefined,
  };
}

expensesRouter.get("/ledger", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req);
    res.json(await buildLedger(req.tenantId!, from, to));
  } catch (err) {
    next(err);
  }
});

expensesRouter.get("/ledger/export.csv", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req);
    const { entries } = await buildLedger(req.tenantId!, from, to);

    const rows = [
      ["Date", "Type", "Description", "Amount"],
      ...entries.map((e) => [e.date.toISOString().slice(0, 10), e.kind, e.description, e.amount]),
    ];
    const csv = toCsv(rows.map((row) => row.map(String)));

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="ledger.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});
