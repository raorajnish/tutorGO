import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireOrganization } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { notify } from "../services/notify.js";
import { sendPush } from "../services/push.js";
import { sendMail } from "../services/mailer.js";
import type { SupportTicketCategory } from "../generated/prisma/enums.js";

export const supportRouter = Router();

// Scoped by organizationId, not instituteId — see the schema.prisma block
// comment above SupportTicket. requireOrganization is the same gate OWNER
// already passes before entering any institute, so an OWNER can file and
// read tickets at the org level, and everyone at the org shares one
// conversation with the platform rather than one silo per institute.
supportRouter.use(authenticate, requireOrganization);

const CATEGORIES = ["BILLING", "BUG", "FEATURE_REQUEST", "OTHER"] as const;

const ticketSummarySelect = {
  id: true,
  category: true,
  subject: true,
  status: true,
  instituteId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { messages: true } },
} as const;

supportRouter.get("/tickets", async (req, res, next) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { organizationId: req.organizationId! },
      select: ticketSummarySelect,
      orderBy: { updatedAt: "desc" },
    });
    res.json(tickets);
  } catch (err) {
    next(err);
  }
});

const createTicketSchema = z.object({
  category: z.enum(CATEGORIES).default("OTHER"),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Message is required").max(5000),
});

supportRouter.post("/tickets", validateBody(createTicketSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createTicketSchema>;
    const authUser = req.user!;

    const ticket = await prisma.supportTicket.create({
      data: {
        organizationId: req.organizationId!,
        instituteId: authUser.instituteId,
        createdByUserId: authUser.id,
        category: body.category as SupportTicketCategory,
        subject: body.subject,
        messages: { create: { authorUserId: authUser.id, isFromPlatform: false, body: body.body } },
      },
      select: ticketSummarySelect,
    });

    // SuperAdmins have no institute, so they can't receive the persisted
    // in-app Notification (that row requires one) — the queue itself is
    // their inbox. Email is the actual out-of-band channel here, matching
    // how every other important event in this app has both an in-app and
    // an out-of-band notice.
    const supportEmail = process.env.SUPERADMIN_EMAIL;
    if (supportEmail) {
      await sendMail({
        to: supportEmail,
        subject: `[Support] New ${body.category.toLowerCase().replace("_", " ")} ticket: ${body.subject}`,
        html: `<p><b>${authUser.fullName}</b> (${authUser.email}) opened a ticket.</p><p>${body.body.replace(/\n/g, "<br>")}</p>`,
        purpose: "SUPPORT_TICKET_CREATED",
        organizationId: req.organizationId,
      }).catch(() => {}); // best-effort — a ticket must never fail to create because mail is down
    }

    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});

async function loadOwnTicketOrThrow(organizationId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, fullName: true } } } } },
  });
  if (!ticket || ticket.organizationId !== organizationId) throw ApiError.notFound("Ticket not found");
  return ticket;
}

supportRouter.get("/tickets/:id", async (req, res, next) => {
  try {
    const ticket = await loadOwnTicketOrThrow(req.organizationId!, req.params.id as string);
    res.json(ticket);
  } catch (err) {
    next(err);
  }
});

const replySchema = z.object({ body: z.string().trim().min(1, "Message is required").max(5000) });

supportRouter.post("/tickets/:id/messages", validateBody(replySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof replySchema>;
    const authUser = req.user!;
    const ticket = await loadOwnTicketOrThrow(req.organizationId!, req.params.id as string);

    await prisma.$transaction([
      prisma.supportTicketMessage.create({
        data: { ticketId: ticket.id, authorUserId: authUser.id, isFromPlatform: false, body: body.body },
      }),
      // A reply reopens a resolved ticket — silently marking a follow-up
      // question "still resolved" would just get missed by the platform.
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: ticket.status === "RESOLVED" ? "OPEN" : ticket.status },
      }),
    ]);

    const supportEmail = process.env.SUPERADMIN_EMAIL;
    if (supportEmail) {
      await sendMail({
        to: supportEmail,
        subject: `[Support] New reply on: ${ticket.subject}`,
        html: `<p><b>${authUser.fullName}</b> replied.</p><p>${body.body.replace(/\n/g, "<br>")}</p>`,
        purpose: "SUPPORT_TICKET_REPLY",
        organizationId: req.organizationId,
      }).catch(() => {});
    }

    const updated = await loadOwnTicketOrThrow(req.organizationId!, ticket.id);
    res.status(201).json(updated);
  } catch (err) {
    next(err);
  }
});

/** Fired from platform.ts when a SuperAdmin replies — kept here since it's
 * the staff-side notification, not a platform concern. */
export async function notifyTicketCreatorOfReply(ticket: {
  id: string;
  subject: string;
  instituteId: string | null;
  createdByUserId: string;
}) {
  // The FK on Notification.instituteId is required — an OWNER who filed a
  // ticket before ever entering an institute has none to satisfy it. Push
  // still works either way (it only keys off userId), so that's the one
  // channel guaranteed to fire regardless.
  if (ticket.instituteId) {
    await notify({
      instituteId: ticket.instituteId,
      userId: ticket.createdByUserId,
      type: "SUPPORT_TICKET_REPLY",
      title: "Support replied to your ticket",
      body: ticket.subject,
      metadata: { ticketId: ticket.id },
    });
  }
  await sendPush({
    userId: ticket.createdByUserId,
    title: "Support replied to your ticket",
    body: ticket.subject,
    tag: `support-ticket-${ticket.id}`,
    url: "/support",
  });
}
