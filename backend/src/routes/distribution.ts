import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";
import { toDateOnly } from "../lib/dateOnly.js";

/** Generic physical-item distribution — books, bags, T-shirts, digests,
 * anything a class hands out and needs to track who's received. Ops task,
 * not teaching, so gated the same as Fees (OWNER/ADMIN/RECEPTION) — Faculty
 * left out deliberately, per the user's explicit call. Not module-gated
 * (no `requireModule`): unlike Fees/Payroll/etc this isn't a billable
 * subscription tier, it's a small always-on utility, same pattern as
 * reminders.ts. See changes-phase8.md §8e. */
export const distributionRouter = Router();

const ROLES = ["OWNER", "ADMIN", "RECEPTION"] as const;
distributionRouter.use(authenticate, requireInstitute, requireRoles(...ROLES));

function serializeItem(item: {
  id: string;
  name: string;
  courseId: string | null;
  totalSets: number | null;
  isActive: boolean;
  createdAt: Date;
  course: { id: string; name: string; code: string } | null;
  _count: { receipts: number };
}, receivedCount: number) {
  return {
    id: item.id,
    name: item.name,
    course: item.course,
    totalSets: item.totalSets,
    isActive: item.isActive,
    createdAt: item.createdAt,
    studentCount: item._count.receipts,
    receivedCount,
  };
}

distributionRouter.get("/items", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
    const includeInactive = req.query.includeInactive === "true";

    const items = await prisma.distributionItem.findMany({
      where: { instituteId, courseId, isActive: includeInactive ? undefined : true },
      include: { course: { select: { id: true, name: true, code: true } }, _count: { select: { receipts: true } } },
      orderBy: { createdAt: "desc" },
    });

    // One small count query per item rather than a filtered relation-count
    // (kept out to avoid depending on a Prisma preview feature) — the item
    // list itself is always small (an institute has a handful of
    // distribution drives running at once, not hundreds).
    const receivedCounts = await Promise.all(
      items.map((item) => prisma.distributionReceipt.count({ where: { distributionItemId: item.id, receivedAt: { not: null } } }))
    );

    res.json(items.map((item, i) => serializeItem(item, receivedCounts[i]!)));
  } catch (err) {
    next(err);
  }
});

/** Every student a newly-created item's receipts should cover right now —
 * shared with admission.ts's hook so "who gets a receipt row" is defined in
 * exactly one place, not reimplemented at both call sites. */
async function eligibleStudentIds(instituteId: string, courseId: string | null): Promise<string[]> {
  const students = await prisma.student.findMany({
    where: { instituteId, isActive: true, courseId: courseId ?? undefined },
    select: { id: true },
  });
  return students.map((s) => s.id);
}

const createItemSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  courseId: z.string().min(1).optional(),
  totalSets: z.number().int().positive().optional(),
});

distributionRouter.post("/items", validateBody(createItemSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createItemSchema>;
    const instituteId = req.tenantId!;

    if (body.courseId) {
      const course = await prisma.course.findUnique({ where: { id: body.courseId } });
      if (!course || course.instituteId !== instituteId) throw ApiError.badRequest("Course not found");
    }

    const studentIds = await eligibleStudentIds(instituteId, body.courseId ?? null);

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.distributionItem.create({
        data: { instituteId, name: body.name, courseId: body.courseId, totalSets: body.totalSets },
      });
      if (studentIds.length > 0) {
        await tx.distributionReceipt.createMany({
          data: studentIds.map((studentId) => ({ distributionItemId: created.id, studentId })),
        });
      }
      return created;
    });

    await auditLog({
      action: "DISTRIBUTION_ITEM_CREATED",
      instituteId,
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      targetType: "DistributionItem",
      targetId: item.id,
      metadata: { name: item.name, courseId: item.courseId, studentCount: studentIds.length },
    });

    const full = await prisma.distributionItem.findUniqueOrThrow({
      where: { id: item.id },
      include: { course: { select: { id: true, name: true, code: true } }, _count: { select: { receipts: true } } },
    });
    res.status(201).json(serializeItem(full, 0));
  } catch (err) {
    next(err);
  }
});

async function loadItem(id: string, instituteId: string) {
  const item = await prisma.distributionItem.findUnique({ where: { id } });
  if (!item || item.instituteId !== instituteId) throw ApiError.notFound("Distribution item not found");
  return item;
}

distributionRouter.get("/items/:id/receipts", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const item = await loadItem(req.params.id as string, instituteId);
    const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;

    const receipts = await prisma.distributionReceipt.findMany({
      where: {
        distributionItemId: item.id,
        student: batchId ? { batches: { some: { batchId, leftAt: null } } } : undefined,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            studentCode: true,
            batches: { where: { leftAt: null }, select: { batch: { select: { id: true, name: true } } }, take: 1 },
          },
        },
      },
      orderBy: { student: { name: "asc" } },
    });

    const rows = receipts.map((r) => ({
      id: r.id,
      student: { id: r.student.id, name: r.student.name, studentCode: r.student.studentCode },
      batch: r.student.batches[0]?.batch ?? null,
      receivedAt: r.receivedAt,
      notes: r.notes,
    }));

    res.json({
      item: { id: item.id, name: item.name, totalSets: item.totalSets },
      receipts: rows,
      receivedCount: rows.filter((r) => r.receivedAt !== null).length,
      totalCount: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

const toggleReceiptSchema = z.object({
  received: z.boolean(),
  notes: z.string().max(300).nullable().optional(),
});

distributionRouter.patch(
  "/items/:id/receipts/:studentId",
  validateBody(toggleReceiptSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof toggleReceiptSchema>;
      const item = await loadItem(req.params.id as string, instituteId);

      const receipt = await prisma.distributionReceipt.findUnique({
        where: { distributionItemId_studentId: { distributionItemId: item.id, studentId: req.params.studentId as string } },
      });
      if (!receipt) throw ApiError.notFound("This student isn't on this item's roster");

      const updated = await prisma.distributionReceipt.update({
        where: { id: receipt.id },
        data: {
          receivedAt: body.received ? toDateOnly(new Date()) : null,
          notes: body.notes,
          updatedByUserId: req.user!.id,
        },
      });

      res.json({ id: updated.id, receivedAt: updated.receivedAt, notes: updated.notes });
    } catch (err) {
      next(err);
    }
  }
);

const bulkReceiptSchema = z.object({
  studentIds: z.array(z.string().min(1)).min(1, "Select at least one student"),
});

/** Roster-style bulk action, matching Attendance's "mark all present" —
 * marks every listed student received as of today; students already marked
 * are left untouched (idempotent, matching mark-all-present's own
 * skip-already-marked behavior). */
distributionRouter.post(
  "/items/:id/receipts/bulk",
  validateBody(bulkReceiptSchema),
  async (req, res, next) => {
    try {
      const instituteId = req.tenantId!;
      const body = req.body as z.infer<typeof bulkReceiptSchema>;
      const item = await loadItem(req.params.id as string, instituteId);

      const result = await prisma.distributionReceipt.updateMany({
        where: { distributionItemId: item.id, studentId: { in: body.studentIds }, receivedAt: null },
        data: { receivedAt: toDateOnly(new Date()), updatedByUserId: req.user!.id },
      });

      res.json({ updatedCount: result.count });
    } catch (err) {
      next(err);
    }
  }
);
