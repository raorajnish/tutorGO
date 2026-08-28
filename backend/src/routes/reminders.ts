import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { loadUserRefs } from "../lib/userRefs.js";
import { normalizeLeadDays, reminderNotifyFields, sendReminderNow } from "../services/reminderScheduler.js";
import { daysBetween, toDateOnly, todayDateOnly } from "../lib/dateOnly.js";
import type { ScheduledReminder } from "../generated/prisma/client.js";

export const remindersRouter = Router();

// Ops/admin concern, matching the Expenses precedent — not module-gated,
// since reminders aren't a billable module and every institute has bills to
// remember. See changes-phase8.md §8d.
remindersRouter.use(authenticate, requireInstitute, requireRoles("OWNER", "ADMIN"));

const REMINDER_CATEGORIES = ["UTILITY", "RENT", "MAINTENANCE", "COMPLIANCE", "SUPPLIES", "OTHER"] as const;
const REMINDER_REPEATS = ["NONE", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
const REMINDER_AUDIENCES = ["PRIVATE", "ADMINS"] as const;

type ReminderStatus = "SCHEDULED" | "NOTIFYING" | "DUE_TODAY" | "OVERDUE";

/** Derived, never stored — same principle as FeeInstallment's status: the row
 * holds the facts (dates, lead time) and the label is computed from them, so
 * it can't drift out of sync with the dates that justify it. */
function reminderStatus(r: ScheduledReminder, today: Date): ReminderStatus {
  if (r.dueDate < today) return "OVERDUE";
  if (r.dueDate.getTime() === today.getTime()) return "DUE_TODAY";
  // Inside the notification window once the first (largest) lead time has
  // passed — i.e. it has already started nudging.
  const firstLead = r.leadDays[0];
  if (firstLead !== undefined && daysBetween(today, r.dueDate) <= firstLead) return "NOTIFYING";
  return "SCHEDULED";
}

function serializeReminder(r: ScheduledReminder, today: Date, createdByName: string | null) {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    dueDate: r.dueDate,
    leadDays: r.leadDays,
    repeat: r.repeat,
    audience: r.audience,
    notes: r.notes,
    isActive: r.isActive,
    lastFiredAt: r.lastFiredAt,
    /// When the next unfired nudge goes out; null once every lead time for
    /// this due date has already notified.
    nextNotifyOn: r.nextNotifyOn,
    nextNotifyLead: r.nextNotifyLead,
    daysUntilDue: daysBetween(today, r.dueDate),
    status: reminderStatus(r, today),
    createdByName,
  };
}

async function loadReminder(id: string, instituteId: string) {
  const reminder = await prisma.scheduledReminder.findUnique({ where: { id } });
  if (!reminder || reminder.instituteId !== instituteId) throw ApiError.notFound("Reminder not found");
  return reminder;
}

/** A PRIVATE reminder belongs to whoever made it — nobody else, not even
 * another admin, should see or edit it. ADMINS reminders are institute-wide
 * and editable by any OWNER/ADMIN who can reach this router. */
function assertCanAccess(reminder: ScheduledReminder, userId: string) {
  if (reminder.audience === "PRIVATE" && reminder.createdByUserId !== userId) {
    throw ApiError.notFound("Reminder not found");
  }
}

remindersRouter.get("/", async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const userId = req.user!.id;
    const includeInactive = req.query.includeInactive === "true";

    const reminders = await prisma.scheduledReminder.findMany({
      where: {
        instituteId,
        isActive: includeInactive ? undefined : true,
        // Never leak someone else's private reminders.
        OR: [{ audience: "ADMINS" }, { createdByUserId: userId }],
      },
      orderBy: { dueDate: "asc" },
    });

    const today = todayDateOnly();
    const userRefs = await loadUserRefs(reminders.map((r) => r.createdByUserId));

    res.json(reminders.map((r) => serializeReminder(r, today, userRefs.get(r.createdByUserId)?.fullName ?? null)));
  } catch (err) {
    next(err);
  }
});

const leadDaysSchema = z
  .array(z.number().int().min(0, "Lead time can't be negative").max(730, "Lead time can't exceed two years"))
  .min(1, "Pick at least one reminder time")
  .max(6, "At most 6 reminder times");

const createSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  category: z.enum(REMINDER_CATEGORIES).default("OTHER"),
  dueDate: z.coerce.date(),
  leadDays: leadDaysSchema.default([7]),
  repeat: z.enum(REMINDER_REPEATS).default("NONE"),
  audience: z.enum(REMINDER_AUDIENCES).default("PRIVATE"),
  notes: z.string().max(500).optional(),
});

remindersRouter.post("/", validateBody(createSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createSchema>;
    const instituteId = req.tenantId!;

    const created = await prisma.scheduledReminder.create({
      data: {
        instituteId,
        createdByUserId: req.user!.id,
        title: body.title,
        category: body.category,
        ...reminderNotifyFields(toDateOnly(body.dueDate), normalizeLeadDays(body.leadDays)),
        repeat: body.repeat,
        audience: body.audience,
        notes: body.notes,
      },
    });

    res.status(201).json(serializeReminder(created, todayDateOnly(), req.user!.fullName));
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  category: z.enum(REMINDER_CATEGORIES).optional(),
  dueDate: z.coerce.date().optional(),
  leadDays: leadDaysSchema.optional(),
  repeat: z.enum(REMINDER_REPEATS).optional(),
  audience: z.enum(REMINDER_AUDIENCES).optional(),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

remindersRouter.patch("/:id", validateBody(updateSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof updateSchema>;
    const reminder = await loadReminder(req.params.id as string, instituteId);
    assertCanAccess(reminder, req.user!.id);

    // Rescheduling re-arms every lead time from the top: the notifications
    // already sent were about the *old* date, so they shouldn't suppress
    // nudges for the new one. Recomputed via reminderNotifyFields so the
    // stored cursor can never disagree with the dates it's derived from.
    const rescheduled = body.dueDate !== undefined || body.leadDays !== undefined;
    const nextDueDate = body.dueDate !== undefined ? toDateOnly(body.dueDate) : reminder.dueDate;
    const nextLeadDays = body.leadDays ?? reminder.leadDays;

    const updated = await prisma.scheduledReminder.update({
      where: { id: reminder.id },
      data: {
        title: body.title,
        category: body.category,
        repeat: body.repeat,
        audience: body.audience,
        notes: body.notes,
        isActive: body.isActive,
        ...(rescheduled ? reminderNotifyFields(nextDueDate, nextLeadDays) : {}),
      },
    });

    const userRefs = await loadUserRefs([updated.createdByUserId]);
    res.json(serializeReminder(updated, todayDateOnly(), userRefs.get(updated.createdByUserId)?.fullName ?? null));
  } catch (err) {
    next(err);
  }
});

/** Hard delete, unlike Course/Subject/Batch's soft-delete. Nothing references
 * a reminder — no history hangs off it and no record becomes unreadable — so
 * keeping dead rows around would just be clutter. `isActive` already covers
 * "pause it without losing it". */
remindersRouter.delete("/:id", async (req, res, next) => {
  try {
    const reminder = await loadReminder(req.params.id as string, req.tenantId!);
    assertCanAccess(reminder, req.user!.id);

    await prisma.scheduledReminder.delete({ where: { id: reminder.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** Fire immediately, ignoring lead time — for "I want to tell everyone about
 * this now" and for verifying a reminder is wired up correctly. */
remindersRouter.post("/:id/send-now", async (req, res, next) => {
  try {
    const reminder = await loadReminder(req.params.id as string, req.tenantId!);
    assertCanAccess(reminder, req.user!.id);
    if (!reminder.isActive) throw ApiError.badRequest("This reminder is paused — resume it before sending.");

    const sentCount = await sendReminderNow(reminder);
    res.json({ sentCount });
  } catch (err) {
    next(err);
  }
});
