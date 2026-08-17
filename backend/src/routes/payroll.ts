import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireModule, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { money } from "../lib/money.js";
import { loadUserRefs } from "../lib/userRefs.js";
import { allocateWaterfall } from "../services/waterfallAllocation.js";
import { periodKey, periodLabel, previewPeriod, syncLineItems } from "../services/payrollSync.js";
import { auditLog } from "../services/audit.js";
import { notify } from "../services/notify.js";
import { sendMail } from "../services/mailer.js";
import { renderTemplate, resolveTemplate } from "../lib/messageTemplates.js";
import { payslipEmailHtml } from "../lib/emailTemplates.js";

export const payrollRouter = Router();

payrollRouter.use(authenticate, requireInstitute, requireModule("PAYROLL"));

// Payroll is money leaving the institute — stricter than Fees (which lets
// RECEPTION record routine collections). Setting up who's on payroll and
// what they're paid (creating/editing/deleting a SalaryProfile, voiding a
// payment, approving/reopening a run) is a compensation decision — OWNER/
// ADMIN only. Recording that a payment actually went out (POST /pay, the
// run's bulk "mark paid" sweep) is routine data entry an accountant does
// day-to-day, so ACCOUNTANT gets that too, not just read access.
const MANAGE_ROLES = ["OWNER", "ADMIN"] as const;
const PAY_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT"] as const;
const REVIEW_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT"] as const;
const PAYROLL_ELIGIBLE_ROLES = ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"] as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type LineItemStatus = "UNPAID" | "PARTIAL" | "PAID";

function lineItemStatus(item: { amount: Prisma.Decimal; paidAmount: Prisma.Decimal }): LineItemStatus {
  if (item.paidAmount.gte(item.amount)) return "PAID";
  if (item.paidAmount.gt(0)) return "PARTIAL";
  return "UNPAID";
}

function serializeLineItem(item: {
  id: string;
  kind: string;
  periodMonth: string;
  lectureId: string | null;
  label: string;
  amount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
}) {
  return {
    id: item.id,
    kind: item.kind,
    periodMonth: item.periodMonth,
    lectureId: item.lectureId,
    label: item.label,
    amount: money(item.amount),
    paidAmount: money(item.paidAmount),
    status: lineItemStatus(item),
  };
}

/** Groups a flat line-item list into the month-accordion shape the frontend
 * renders directly — newest period first. */
interface GroupableLineItem {
  id: string;
  kind: string;
  periodMonth: string;
  lectureId: string | null;
  label: string;
  amount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
}

function groupByPeriod(items: GroupableLineItem[]) {
  const byPeriod = new Map<string, typeof items>();
  for (const item of items) {
    if (!byPeriod.has(item.periodMonth)) byPeriod.set(item.periodMonth, []);
    byPeriod.get(item.periodMonth)!.push(item);
  }

  return [...byPeriod.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([periodMonth, periodItems]) => {
      const totalAmount = periodItems.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
      const totalPaid = periodItems.reduce((sum, i) => sum.plus(i.paidAmount), new Prisma.Decimal(0));
      return {
        periodMonth,
        label: periodLabel(periodMonth),
        totalAmount: money(totalAmount),
        totalPaid: money(totalPaid),
        totalOutstanding: money(totalAmount.minus(totalPaid)),
        lineItems: periodItems.map((i) => serializeLineItem(i)),
      };
    });
}

function profileName(profile: { externalName: string | null; user: { fullName: string } | null }) {
  return profile.user?.fullName ?? profile.externalName ?? "—";
}

function profileTitle(profile: { title: string | null; user: { role: string } | null }) {
  return profile.title ?? profile.user?.role ?? null;
}

async function loadProfile(id: string, instituteId: string) {
  const profile = await prisma.salaryProfile.findUnique({
    where: { id },
    include: { user: { select: { id: true, fullName: true, role: true, instituteId: true, email: true } } },
  });
  if (!profile || profile.instituteId !== instituteId) throw ApiError.notFound("Staff member not found");
  return profile;
}

async function pendingAmountFor(salaryProfileId: string): Promise<Prisma.Decimal> {
  const items = await prisma.payrollLineItem.findMany({ where: { salaryProfileId } });
  const outstanding = items.reduce((sum, i) => sum.plus(i.amount.minus(i.paidAmount)), new Prisma.Decimal(0));
  const advance = await advanceBalance(salaryProfileId);
  return outstanding.minus(advance);
}

/** Fires both channels for a recorded payment: a real in-app notification
 * (only possible when the profile is linked to a platform User — a no-login
 * external staff member has nowhere in-app to see it) and an email, sent to
 * whichever address is available (User.email for platform staff,
 * SalaryProfile.externalEmail for external staff). Neither is required —
 * sendMail degrades to a logged no-op if nothing's configured anywhere, and
 * a profile with no email at all just gets skipped. Never throws: a
 * notification failure must not roll back a real payment. */
async function notifyPaymentRecorded(
  profile: {
    id: string;
    instituteId: string;
    externalName: string | null;
    externalEmail: string | null;
    title: string | null;
    user: { id: string; fullName: string; role: string; email: string } | null;
  },
  payment: { amount: Prisma.Decimal; mode: string; paidOn: Date }
) {
  try {
    const pending = await pendingAmountFor(profile.id);
    const institute = await prisma.institute.findUnique({ where: { id: profile.instituteId }, select: { name: true } });
    const name = profileName(profile);
    const paidOnLabel = payment.paidOn.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

    if (profile.user) {
      await notify({
        instituteId: profile.instituteId,
        userId: profile.user.id,
        type: "PAYROLL_PAYMENT_RECORDED",
        title: `₹${money(payment.amount)} paid to you`,
        body: `Paid via ${payment.mode} on ${paidOnLabel}. Pending balance: ₹${money(pending)}.`,
        metadata: { amount: money(payment.amount), mode: payment.mode, paidOn: payment.paidOn.toISOString(), pendingAmount: money(pending) },
      });
    }

    const email = profile.user?.email ?? profile.externalEmail;
    if (email) {
      const templateBody = await resolveTemplate(profile.instituteId, "PAYROLL_PAYMENT_RECORDED");
      const subject = renderTemplate(templateBody, {
        name,
        amount: money(payment.amount) ?? "0.00",
        mode: payment.mode,
        paidOn: paidOnLabel,
        pendingAmount: money(pending) ?? "0.00",
        instituteName: institute?.name ?? "TutorGO",
      })
        .split("\n")[0]!
        .replace(/[*_]/g, "");

      await sendMail({
        to: email,
        subject,
        html: payslipEmailHtml({
          recipientName: name,
          instituteName: institute?.name ?? "TutorGO",
          amount: money(payment.amount) ?? "0.00",
          mode: payment.mode,
          paidOn: paidOnLabel,
          pendingAmount: money(pending) ?? "0.00",
        }),
        purpose: "PAYROLL_PAYMENT_RECORDED",
        instituteId: profile.instituteId,
      });
    }
  } catch {
    // Best-effort — the payment itself already succeeded and must stand
    // regardless of whether notifying the staff member works.
  }
}

/** Sum of unconsumed advance credit (unapplied leftover from an overpayment)
 * for a profile — everything syncLineItems' reconciliation pass couldn't
 * find an open line item to absorb yet. */
async function advanceBalance(salaryProfileId: string): Promise<Prisma.Decimal> {
  const advances = await prisma.payrollPaymentAllocation.findMany({
    where: { lineItemId: null, payment: { salaryProfileId, voidedAt: null } },
  });
  return advances.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0));
}

// ---------------------------------------------------------------------------
// Staff directory
// ---------------------------------------------------------------------------

const createProfileSchema = z
  .object({
    userId: z.string().optional(),
    externalName: z.string().min(1).optional(),
    externalEmail: z.string().email().optional(),
    externalPhone: z.string().optional(),
    title: z.string().max(100).optional(),
    salaryType: z.enum(["FIXED", "PER_LECTURE"]),
    monthlyRate: z.number().positive().optional(),
    perLectureRate: z.number().positive().optional(),
  })
  .refine((b) => !!b.userId !== !!b.externalName, {
    message: "Provide either an existing staff member or an external name, not both",
  })
  .refine((b) => b.salaryType !== "FIXED" || b.monthlyRate !== undefined, {
    message: "Monthly rate is required for a fixed salary",
  })
  .refine((b) => b.salaryType !== "PER_LECTURE" || b.perLectureRate !== undefined, {
    message: "Per-lecture rate is required",
  })
  .refine((b) => b.salaryType !== "PER_LECTURE" || !!b.userId, {
    message: "Per-lecture pay requires linking a faculty member — external staff can only be on a fixed salary",
  });

payrollRouter.post("/staff", requireRoles(...MANAGE_ROLES), validateBody(createProfileSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createProfileSchema>;
    const instituteId = req.tenantId!;

    if (body.userId) {
      const user = await prisma.user.findUnique({ where: { id: body.userId } });
      if (!user || user.instituteId !== instituteId) throw ApiError.badRequest("Staff member not found");
      if (!PAYROLL_ELIGIBLE_ROLES.includes(user.role as (typeof PAYROLL_ELIGIBLE_ROLES)[number])) {
        throw ApiError.badRequest("This role is not eligible for payroll");
      }
      if (body.salaryType === "PER_LECTURE" && user.role !== "FACULTY") {
        throw ApiError.badRequest("Per-lecture pay is only available for faculty");
      }
      const existing = await prisma.salaryProfile.findUnique({ where: { userId: body.userId } });
      if (existing) throw ApiError.conflict("This staff member already has a salary profile");
    }

    const created = await prisma.salaryProfile.create({
      data: {
        instituteId,
        userId: body.userId,
        externalName: body.userId ? undefined : body.externalName,
        externalEmail: body.userId ? undefined : body.externalEmail,
        externalPhone: body.userId ? undefined : body.externalPhone,
        title: body.title,
        salaryType: body.salaryType,
        monthlyRate: body.salaryType === "FIXED" ? new Prisma.Decimal(body.monthlyRate!) : undefined,
        perLectureRate: body.salaryType === "PER_LECTURE" ? new Prisma.Decimal(body.perLectureRate!) : undefined,
      },
      include: { user: { select: { id: true, fullName: true, role: true, instituteId: true } } },
    });

    res.status(201).json({
      id: created.id,
      name: profileName(created),
      title: profileTitle(created),
      isExternal: !created.userId,
      externalEmail: created.externalEmail,
      externalPhone: created.externalPhone,
      salaryType: created.salaryType,
      monthlyRate: money(created.monthlyRate),
      perLectureRate: money(created.perLectureRate),
      isActive: created.isActive,
    });
  } catch (err) {
    next(err);
  }
});

const updateProfileSchema = z.object({
  title: z.string().max(100).nullable().optional(),
  externalEmail: z.string().email().nullable().optional(),
  externalPhone: z.string().nullable().optional(),
  monthlyRate: z.number().positive().optional(),
  perLectureRate: z.number().positive().optional(),
  isActive: z.boolean().optional(),
});

payrollRouter.patch("/staff/:id", requireRoles(...MANAGE_ROLES), validateBody(updateProfileSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof updateProfileSchema>;
    const instituteId = req.tenantId!;
    const profile = await loadProfile(req.params.id as string, instituteId);

    // deactivatedAt tracks *when* isActive last flipped false — it's what
    // pro-rates the final period's line item (see payrollSync.ts) and what
    // caps generation at their last day. Reactivating clears it: a future
    // period after reactivation gets the full rate again, same non-
    // retroactive principle as everywhere else.
    const activating = body.isActive === true && !profile.isActive;
    const deactivating = body.isActive === false && profile.isActive;

    const updated = await prisma.salaryProfile.update({
      where: { id: profile.id },
      data: {
        title: body.title,
        externalEmail: body.externalEmail,
        externalPhone: body.externalPhone,
        monthlyRate: body.monthlyRate !== undefined ? new Prisma.Decimal(body.monthlyRate) : undefined,
        perLectureRate: body.perLectureRate !== undefined ? new Prisma.Decimal(body.perLectureRate) : undefined,
        isActive: body.isActive,
        deactivatedAt: deactivating ? new Date() : activating ? null : undefined,
      },
      include: { user: { select: { id: true, fullName: true, role: true, instituteId: true } } },
    });

    const rateChanged =
      (body.monthlyRate !== undefined && !profile.monthlyRate?.equals(body.monthlyRate)) ||
      (body.perLectureRate !== undefined && !profile.perLectureRate?.equals(body.perLectureRate));
    if (rateChanged) {
      await auditLog({
        action: "PAYROLL_RATE_CHANGED",
        instituteId,
        userId: req.user!.id,
        targetType: "SalaryProfile",
        targetId: profile.id,
        metadata: {
          from: { monthlyRate: money(profile.monthlyRate), perLectureRate: money(profile.perLectureRate) },
          to: { monthlyRate: money(updated.monthlyRate), perLectureRate: money(updated.perLectureRate) },
        },
      });
    }
    if (deactivating || activating) {
      await auditLog({
        action: deactivating ? "PAYROLL_PROFILE_DEACTIVATED" : "PAYROLL_PROFILE_ACTIVATED",
        instituteId,
        userId: req.user!.id,
        targetType: "SalaryProfile",
        targetId: profile.id,
      });
    }

    res.json({
      id: updated.id,
      name: profileName(updated),
      title: profileTitle(updated),
      isExternal: !updated.userId,
      externalEmail: updated.externalEmail,
      externalPhone: updated.externalPhone,
      salaryType: updated.salaryType,
      monthlyRate: money(updated.monthlyRate),
      perLectureRate: money(updated.perLectureRate),
      isActive: updated.isActive,
    });
  } catch (err) {
    next(err);
  }
});

// Escape hatch for a pure data-entry mistake — only allowed with zero
// payment history, so there's never a receipt/audit gap to explain later.
// Anything with even one payment must be deactivated instead (§ PATCH above).
payrollRouter.delete("/staff/:id", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const profile = await loadProfile(req.params.id as string, req.tenantId!);

    const paymentCount = await prisma.payrollPayment.count({ where: { salaryProfileId: profile.id } });
    if (paymentCount > 0) {
      throw ApiError.badRequest("This staff member has payment history — deactivate them instead of deleting.");
    }

    await prisma.$transaction([
      prisma.payrollLineItem.deleteMany({ where: { salaryProfileId: profile.id } }),
      prisma.salaryProfile.delete({ where: { id: profile.id } }),
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

payrollRouter.get("/staff/:id/rate-history", requireRoles(...REVIEW_ROLES), async (req, res, next) => {
  try {
    const profile = await loadProfile(req.params.id as string, req.tenantId!);

    const entries = await prisma.auditLog.findMany({
      where: { instituteId: req.tenantId!, targetType: "SalaryProfile", targetId: profile.id, action: "PAYROLL_RATE_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    const userRefs = await loadUserRefs(entries.map((e) => e.userId));

    res.json(
      entries.map((e) => ({
        id: e.id,
        changedByName: e.userId ? (userRefs.get(e.userId)?.fullName ?? null) : null,
        changedAt: e.createdAt,
        from: (e.metadata as { from?: unknown } | null)?.from ?? null,
        to: (e.metadata as { to?: unknown } | null)?.to ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

payrollRouter.get("/staff", requireRoles(...REVIEW_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;

    const profiles = await prisma.salaryProfile.findMany({
      where: { instituteId },
      include: { user: { select: { id: true, fullName: true, role: true, instituteId: true } } },
      orderBy: { createdAt: "asc" },
    });

    const staff = await Promise.all(
      profiles.map(async (p) => {
        // Line items are generated lazily on read (services/payrollSync.ts) —
        // without this, a profile whose ledger was never opened shows a
        // stale "Settled" here even when real lectures/months are owed.
        await prisma.$transaction(async (tx) => syncLineItems(tx, p));

        const items = await prisma.payrollLineItem.findMany({ where: { salaryProfileId: p.id } });
        const outstanding = items.reduce((sum, i) => sum.plus(i.amount.minus(i.paidAmount)), new Prisma.Decimal(0));
        const advance = await advanceBalance(p.id);
        const lastPayment = await prisma.payrollPayment.findFirst({
          where: { salaryProfileId: p.id, voidedAt: null },
          orderBy: { paidOn: "desc" },
        });

        return {
          id: p.id,
          name: profileName(p),
          title: profileTitle(p),
          isExternal: !p.userId,
          externalEmail: p.externalEmail,
          externalPhone: p.externalPhone,
          salaryType: p.salaryType,
          monthlyRate: money(p.monthlyRate),
          perLectureRate: money(p.perLectureRate),
          isActive: p.isActive,
          pendingAmount: money(outstanding.minus(advance)),
          lastPaidOn: lastPayment?.paidOn ?? null,
          lastPaidAmount: lastPayment ? money(lastPayment.amount) : null,
        };
      })
    );

    const configuredUserIds = new Set(profiles.map((p) => p.userId).filter((id): id is string => !!id));
    const unconfigured = await prisma.user.findMany({
      where: { instituteId, isActive: true, role: { in: [...PAYROLL_ELIGIBLE_ROLES] }, id: { notIn: [...configuredUserIds] } },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    });

    res.json({ staff, unconfigured });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Ledger — period-grouped line items for one staff member
// ---------------------------------------------------------------------------

async function buildLedger(profile: Awaited<ReturnType<typeof loadProfile>>) {
  await prisma.$transaction(async (tx) => syncLineItems(tx, profile));

  const items = await prisma.payrollLineItem.findMany({
    where: { salaryProfileId: profile.id },
    orderBy: [{ periodMonth: "desc" }, { createdAt: "asc" }],
  });
  const advance = await advanceBalance(profile.id);

  // Lifetime totals — "how many lectures, how much made so far, how much is
  // still pending" — same figures whether an admin is reviewing this staff
  // member or the staff member is looking at their own payslips.
  const totalEarned = items.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
  const totalPaid = items.reduce((sum, i) => sum.plus(i.paidAmount), new Prisma.Decimal(0));
  const lecturesCount = items.filter((i) => i.kind === "LECTURE").length;

  return {
    id: profile.id,
    name: profileName(profile),
    title: profileTitle(profile),
    salaryType: profile.salaryType,
    monthlyRate: money(profile.monthlyRate),
    perLectureRate: money(profile.perLectureRate),
    isActive: profile.isActive,
    advanceBalance: money(advance),
    totals: {
      lecturesCount,
      totalEarned: money(totalEarned),
      totalPaid: money(totalPaid),
      totalPending: money(totalEarned.minus(totalPaid).minus(advance)),
    },
    periods: groupByPeriod(items),
  };
}

payrollRouter.get("/staff/:id/ledger", requireRoles(...REVIEW_ROLES), async (req, res, next) => {
  try {
    const profile = await loadProfile(req.params.id as string, req.tenantId!);
    res.json(await buildLedger(profile));
  } catch (err) {
    next(err);
  }
});

payrollRouter.get("/my-payslips", async (req, res, next) => {
  try {
    const profile = await prisma.salaryProfile.findUnique({
      where: { userId: req.user!.id },
      include: { user: { select: { id: true, fullName: true, role: true, instituteId: true, email: true } } },
    });
    if (!profile || profile.instituteId !== req.tenantId) {
      return res.json({
        id: null,
        periods: [],
        advanceBalance: "0.00",
        totals: { lecturesCount: 0, totalEarned: "0.00", totalPaid: "0.00", totalPending: "0.00" },
      });
    }
    res.json(await buildLedger(profile));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Payments — selectable line items, waterfall within selection, credit beyond it
// ---------------------------------------------------------------------------

function serializePayment(p: {
  id: string;
  amount: Prisma.Decimal;
  mode: string;
  paidOn: Date;
  notes: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  createdAt: Date;
  createdBy: { id: string; fullName: string } | null;
  voidedBy: { id: string; fullName: string } | null;
  allocations: { lineItemId: string | null; amount: Prisma.Decimal }[];
}) {
  return {
    id: p.id,
    amount: money(p.amount),
    mode: p.mode,
    paidOn: p.paidOn,
    notes: p.notes,
    voided: p.voidedAt !== null,
    voidReason: p.voidReason,
    createdAt: p.createdAt,
    createdByName: p.createdBy?.fullName ?? null,
    voidedByName: p.voidedBy?.fullName ?? null,
    allocations: p.allocations.map((a) => ({ lineItemId: a.lineItemId, amount: money(a.amount) })),
  };
}

const payAllocationInclude = { allocations: true } as const;

const recordPaymentSchema = z.object({
  salaryProfileId: z.string().min(1),
  amount: z.number().positive("Amount must be greater than zero"),
  mode: z.enum(["UPI", "CASH", "CARD", "BANK_TRANSFER", "CHEQUE"]),
  paidOn: z.coerce.date(),
  lineItemIds: z.array(z.string()).default([]),
  notes: z.string().max(300).optional(),
  // Default true — an amount exceeding the selected items' total becomes a
  // credit, auto-applied to whatever's generated next (see §0/§4 of the
  // Payroll addendum in changes.md). Turning this off makes payroll behave
  // like Fees instead: the excess is rejected outright, so the admin either
  // re-enters a smaller amount or selects more line items to cover it —
  // for whoever wants "flag it, don't silently carry it forward."
  autoApplyCredit: z.boolean().default(true),
});

payrollRouter.post("/pay", requireRoles(...PAY_ROLES), validateBody(recordPaymentSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof recordPaymentSchema>;
    const instituteId = req.tenantId!;
    const profile = await loadProfile(body.salaryProfileId, instituteId);

    const selected = await prisma.payrollLineItem.findMany({
      where: { id: { in: body.lineItemIds }, salaryProfileId: profile.id },
      orderBy: [{ periodMonth: "asc" }, { createdAt: "asc" }],
    });
    const outstanding = selected.filter((i) => i.amount.gt(i.paidAmount));

    // Unlike Fees, an amount exceeding the selected items' total is accepted
    // as a credit (the "advance" allocation, lineItemId: null) by default —
    // see changes.md's Payroll addendum §0/§4 — unless the caller turned
    // autoApplyCredit off, in which case it's rejected just like Fees.
    const { allocations, leftover } = allocateWaterfall(
      outstanding.map((i) => ({ id: i.id, outstanding: i.amount.minus(i.paidAmount) })),
      new Prisma.Decimal(body.amount)
    );

    if (leftover.gt(0) && !body.autoApplyCredit) {
      const applicable = new Prisma.Decimal(body.amount).minus(leftover);
      throw ApiError.badRequest(
        `Amount exceeds the selected items' total — only ₹${money(applicable)} of ₹${money(body.amount)} could be applied. Turn on "Auto-apply excess as credit" to carry the rest forward instead.`
      );
    }

    const paymentId = await prisma.$transaction(async (tx) => {
      const created = await tx.payrollPayment.create({
        data: {
          instituteId,
          salaryProfileId: profile.id,
          amount: new Prisma.Decimal(body.amount),
          mode: body.mode,
          paidOn: body.paidOn,
          notes: body.notes,
          createdByUserId: req.user!.id,
        },
      });

      for (const a of allocations) {
        await tx.payrollPaymentAllocation.create({ data: { paymentId: created.id, lineItemId: a.id, amount: a.amount } });
        await tx.payrollLineItem.update({ where: { id: a.id }, data: { paidAmount: { increment: a.amount } } });
      }
      if (leftover.gt(0)) {
        await tx.payrollPaymentAllocation.create({ data: { paymentId: created.id, lineItemId: null, amount: leftover } });
      }

      return created.id;
    });

    const fullPayment = await prisma.payrollPayment.findUnique({ where: { id: paymentId }, include: payAllocationInclude });
    const createdBy = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { id: true, fullName: true } });
    void notifyPaymentRecorded(profile, { amount: fullPayment!.amount, mode: fullPayment!.mode, paidOn: fullPayment!.paidOn });
    res.status(201).json(serializePayment({ ...fullPayment!, createdBy: createdBy ?? null, voidedBy: null }));
  } catch (err) {
    next(err);
  }
});

payrollRouter.get("/pay", requireRoles(...REVIEW_ROLES), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const salaryProfileId = typeof req.query.salaryProfileId === "string" ? req.query.salaryProfileId : undefined;

    const payments = await prisma.payrollPayment.findMany({
      where: { instituteId, salaryProfileId },
      include: payAllocationInclude,
      orderBy: { paidOn: "desc" },
    });
    const userRefs = await loadUserRefs(payments.flatMap((p) => [p.createdByUserId, p.voidedByUserId]));

    res.json(
      payments.map((p) =>
        serializePayment({
          ...p,
          createdBy: p.createdByUserId ? (userRefs.get(p.createdByUserId) ?? null) : null,
          voidedBy: p.voidedByUserId ? (userRefs.get(p.voidedByUserId) ?? null) : null,
        })
      )
    );
  } catch (err) {
    next(err);
  }
});

const voidPaymentSchema = z.object({ reason: z.string().min(1, "A reason is required").max(300) });

payrollRouter.post("/pay/:id/void", requireRoles(...MANAGE_ROLES), validateBody(voidPaymentSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof voidPaymentSchema>;

    const payment = await prisma.payrollPayment.findUnique({ where: { id: req.params.id as string }, include: { allocations: true } });
    if (!payment || payment.instituteId !== instituteId) throw ApiError.notFound("Payment not found");
    if (payment.voidedAt) throw ApiError.badRequest("This payment is already voided");

    const paymentId = await prisma.$transaction(async (tx) => {
      for (const a of payment.allocations) {
        if (!a.lineItemId) continue; // advance allocations aren't reflected on any line item's paidAmount
        const item = await tx.payrollLineItem.findUnique({ where: { id: a.lineItemId } });
        if (item) {
          const newPaid = Prisma.Decimal.max(0, item.paidAmount.minus(a.amount));
          await tx.payrollLineItem.update({ where: { id: item.id }, data: { paidAmount: newPaid } });
        }
      }

      const updated = await tx.payrollPayment.update({
        where: { id: payment.id },
        data: { voidedAt: new Date(), voidReason: body.reason, voidedByUserId: req.user!.id },
      });
      return updated.id;
    });

    const fullPayment = await prisma.payrollPayment.findUnique({ where: { id: paymentId }, include: payAllocationInclude });
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
// Runs — institute-wide sign-off/reporting wrapper for a period (see
// changes.md §5: does not gate the live per-staff ledger above)
// ---------------------------------------------------------------------------

const periodRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
const periodSchema = z.object({ period: z.string().regex(periodRegex, "Period must be YYYY-MM") });

async function activeProfiles(instituteId: string) {
  return prisma.salaryProfile.findMany({
    where: { instituteId, isActive: true },
    include: { user: { select: { id: true, fullName: true, role: true, instituteId: true } } },
  });
}

async function runSummary(instituteId: string, periodMonth: string) {
  const items = await prisma.payrollLineItem.findMany({
    where: { periodMonth, salaryProfile: { instituteId } },
    include: { salaryProfile: { include: { user: { select: { id: true, fullName: true, role: true, instituteId: true } } } } },
  });

  const byProfile = new Map<string, typeof items>();
  for (const item of items) {
    if (!byProfile.has(item.salaryProfileId)) byProfile.set(item.salaryProfileId, []);
    byProfile.get(item.salaryProfileId)!.push(item);
  }

  const staff = [...byProfile.entries()].map(([salaryProfileId, profileItems]) => {
    const totalAmount = profileItems.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
    const totalPaid = profileItems.reduce((sum, i) => sum.plus(i.paidAmount), new Prisma.Decimal(0));
    return {
      salaryProfileId,
      name: profileName(profileItems[0]!.salaryProfile),
      totalAmount: money(totalAmount),
      totalPaid: money(totalPaid),
      totalOutstanding: money(totalAmount.minus(totalPaid)),
    };
  });

  const totalAmount = items.reduce((sum, i) => sum.plus(i.amount), new Prisma.Decimal(0));
  const totalPaid = items.reduce((sum, i) => sum.plus(i.paidAmount), new Prisma.Decimal(0));

  return { staff, totalAmount: money(totalAmount), totalPaid: money(totalPaid), totalOutstanding: money(totalAmount.minus(totalPaid)) };
}

function serializeRun(run: { id: string; periodMonth: string; status: string; approvedAt: Date | null; paidAt: Date | null; createdAt: Date }) {
  return {
    id: run.id,
    periodMonth: run.periodMonth,
    label: periodLabel(run.periodMonth),
    status: run.status,
    approvedAt: run.approvedAt,
    paidAt: run.paidAt,
    createdAt: run.createdAt,
  };
}

payrollRouter.get("/runs", requireRoles(...REVIEW_ROLES), async (req, res, next) => {
  try {
    const runs = await prisma.payrollRun.findMany({ where: { instituteId: req.tenantId! }, orderBy: { periodMonth: "desc" } });
    res.json(runs.map(serializeRun));
  } catch (err) {
    next(err);
  }
});

payrollRouter.get("/runs/preview", requireRoles(...REVIEW_ROLES), async (req, res, next) => {
  try {
    const parsed = periodSchema.safeParse({ period: req.query.period });
    if (!parsed.success) throw ApiError.badRequest("A valid period (YYYY-MM) is required");
    const instituteId = req.tenantId!;

    const profiles = await activeProfiles(instituteId);
    const perProfile = await Promise.all(
      profiles.map(async (p) => {
        const projected = await prisma.$transaction(async (tx) => previewPeriod(tx, p, parsed.data.period));
        return { salaryProfileId: p.id, name: profileName(p), projectedAmount: money(projected) };
      })
    );
    const total = perProfile.reduce((sum, p) => sum.plus(new Prisma.Decimal(p.projectedAmount ?? 0)), new Prisma.Decimal(0));

    res.json({ periodMonth: parsed.data.period, label: periodLabel(parsed.data.period), staff: perProfile, totalAmount: money(total) });
  } catch (err) {
    next(err);
  }
});

payrollRouter.post("/runs", requireRoles(...MANAGE_ROLES), validateBody(periodSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof periodSchema>;
    const instituteId = req.tenantId!;

    const existing = await prisma.payrollRun.findUnique({ where: { instituteId_periodMonth: { instituteId, periodMonth: body.period } } });
    if (existing) throw ApiError.conflict("A payroll run already exists for this period");

    const profiles = await activeProfiles(instituteId);
    await prisma.$transaction(async (tx) => {
      for (const p of profiles) await syncLineItems(tx, p, body.period);
    });

    const run = await prisma.payrollRun.create({ data: { instituteId, periodMonth: body.period } });
    res.status(201).json({ ...serializeRun(run), summary: await runSummary(instituteId, run.periodMonth) });
  } catch (err) {
    next(err);
  }
});

async function loadRun(id: string, instituteId: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run || run.instituteId !== instituteId) throw ApiError.notFound("Payroll run not found");
  return run;
}

payrollRouter.get("/runs/:id", requireRoles(...REVIEW_ROLES), async (req, res, next) => {
  try {
    const run = await loadRun(req.params.id as string, req.tenantId!);
    res.json({ ...serializeRun(run), summary: await runSummary(run.instituteId, run.periodMonth) });
  } catch (err) {
    next(err);
  }
});

payrollRouter.post("/runs/:id/approve", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const run = await loadRun(req.params.id as string, req.tenantId!);
    if (run.status !== "DRAFT") throw ApiError.badRequest("Only a draft run can be approved");

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: "APPROVED", approvedAt: new Date(), approvedByUserId: req.user!.id },
    });
    res.json({ ...serializeRun(updated), summary: await runSummary(updated.instituteId, updated.periodMonth) });
  } catch (err) {
    next(err);
  }
});

payrollRouter.post("/runs/:id/reopen", requireRoles(...MANAGE_ROLES), async (req, res, next) => {
  try {
    const run = await loadRun(req.params.id as string, req.tenantId!);
    if (run.status === "DRAFT") throw ApiError.badRequest("This run is already a draft");

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: "DRAFT", approvedAt: null, approvedByUserId: null, paidAt: null },
    });
    res.json({ ...serializeRun(updated), summary: await runSummary(updated.instituteId, updated.periodMonth) });
  } catch (err) {
    next(err);
  }
});

// Bulk convenience: pays every active profile's remaining outstanding
// balance *for this run's period only*, in full — the "sweep up anyone not
// already paid individually" fast path. Doesn't touch other periods.
payrollRouter.post("/runs/:id/pay", requireRoles(...PAY_ROLES), async (req, res, next) => {
  try {
    const run = await loadRun(req.params.id as string, req.tenantId!);
    if (run.status !== "APPROVED") throw ApiError.badRequest("Only an approved run can be marked paid");

    const items = await prisma.payrollLineItem.findMany({
      where: { periodMonth: run.periodMonth, salaryProfile: { instituteId: run.instituteId } },
    });
    const byProfile = new Map<string, typeof items>();
    for (const item of items) {
      if (!byProfile.has(item.salaryProfileId)) byProfile.set(item.salaryProfileId, []);
      byProfile.get(item.salaryProfileId)!.push(item);
    }

    const paidProfileIds: string[] = [];
    const paidOn = new Date();

    await prisma.$transaction(async (tx) => {
      for (const [salaryProfileId, profileItems] of byProfile) {
        const outstanding = profileItems.filter((i) => i.amount.gt(i.paidAmount));
        const total = outstanding.reduce((sum, i) => sum.plus(i.amount.minus(i.paidAmount)), new Prisma.Decimal(0));
        if (total.lte(0)) continue;

        const payment = await tx.payrollPayment.create({
          data: {
            instituteId: run.instituteId,
            salaryProfileId,
            amount: total,
            mode: "BANK_TRANSFER",
            paidOn,
            notes: `Bulk pay — ${periodLabel(run.periodMonth)} run`,
            createdByUserId: req.user!.id,
          },
        });
        for (const item of outstanding) {
          const applied = item.amount.minus(item.paidAmount);
          await tx.payrollPaymentAllocation.create({ data: { paymentId: payment.id, lineItemId: item.id, amount: applied } });
          await tx.payrollLineItem.update({ where: { id: item.id }, data: { paidAmount: item.amount } });
        }
        paidProfileIds.push(salaryProfileId);
      }

      await tx.payrollRun.update({ where: { id: run.id }, data: { status: "PAID", paidAt: new Date() } });
    });

    for (const salaryProfileId of paidProfileIds) {
      // byProfile was snapshotted before the transaction ran, so paidAmount
      // here is still the pre-payment value — amount minus that is exactly
      // what this bulk payment just covered for this profile.
      const profileItems = byProfile.get(salaryProfileId)!;
      const total = profileItems.reduce((sum, i) => sum.plus(Prisma.Decimal.max(0, i.amount.minus(i.paidAmount))), new Prisma.Decimal(0));
      const profile = await loadProfile(salaryProfileId, run.instituteId);
      void notifyPaymentRecorded(profile, { amount: total, mode: "BANK_TRANSFER", paidOn });
    }

    const updated = await prisma.payrollRun.findUnique({ where: { id: run.id } });
    res.json({ ...serializeRun(updated!), summary: await runSummary(run.instituteId, run.periodMonth) });
  } catch (err) {
    next(err);
  }
});
