import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { hashPassword, generateTempPassword } from "../lib/password.js";
import { sendMail, invalidateInstituteEmailConfigCache } from "../services/mailer.js";
import { inviteEmailHtml } from "../lib/emailTemplates.js";
import { auditLog } from "../services/audit.js";
import { assertRoleCapacity, type CappedRole } from "../services/planLimits.js";
import { notify } from "../services/notify.js";
import { sendPush } from "../services/push.js";
import { DEFAULT_MESSAGE_TEMPLATES, MESSAGE_TEMPLATE_TYPES } from "../lib/messageTemplates.js";
import type { MessageTemplateType } from "../generated/prisma/enums.js";

export const orgRouter = Router();

orgRouter.use(authenticate, requireInstitute);

orgRouter.get("/", async (req, res, next) => {
  try {
    const institute = await prisma.institute.findUniqueOrThrow({
      where: { id: req.tenantId! },
      include: { modules: { include: { module: true } }, plan: true },
    });

    res.json({
      id: institute.id,
      code: institute.code,
      name: institute.name,
      email: institute.email,
      phone: institute.phone,
      address: institute.address,
      city: institute.city,
      state: institute.state,
      planName: institute.plan?.name ?? null,
      isActive: institute.isActive,
      biometricEnabled: institute.biometricEnabled,
      onboardingStep: institute.onboardingStep,
      onboardingDone: institute.onboardingDone,
      modules: institute.modules.map((m) => ({ code: m.module.code, isActive: m.isActive })),
    });
  } catch (err) {
    next(err);
  }
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
});

orgRouter.patch(
  "/",
  requireRoles("OWNER", "ADMIN"),
  validateBody(updateProfileSchema),
  async (req, res, next) => {
    try {
      const institute = await prisma.institute.update({
        where: { id: req.tenantId! },
        data: req.body as z.infer<typeof updateProfileSchema>,
      });
      res.json(institute);
    } catch (err) {
      next(err);
    }
  }
);

const onboardingDetailsSchema = z.object({
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("A valid email is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
});

orgRouter.post(
  "/onboarding-complete",
  requireRoles("ADMIN"),
  validateBody(onboardingDetailsSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof onboardingDetailsSchema>;
      const institute = await prisma.institute.update({
        where: { id: req.tenantId! },
        data: { ...body, onboardingStep: 4, onboardingDone: true },
      });
      res.json({ onboardingStep: institute.onboardingStep, onboardingDone: institute.onboardingDone });
    } catch (err) {
      next(err);
    }
  }
);

orgRouter.get("/modules", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const modules = await prisma.module.findMany({
      include: { institutes: { where: { instituteId: req.tenantId! } } },
      orderBy: { code: "asc" },
    });

    res.json(
      modules.map((m) => ({
        code: m.code,
        label: m.label,
        description: m.description,
        isActive: m.institutes[0]?.isActive ?? false,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Team — staff for the current institute (visible to OWNER/ADMIN)
// ---------------------------------------------------------------------------

const TEAM_ROLES = ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

orgRouter.get("/team", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const team = await prisma.user.findMany({
      where: { instituteId: req.tenantId!, role: { in: [...TEAM_ROLES] } },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    res.json(team);
  } catch (err) {
    next(err);
  }
});

const inviteTeamSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  phone: z.string().optional(),
  role: z.enum(TEAM_ROLES),
});

orgRouter.post("/team", requireRoles("OWNER", "ADMIN"), validateBody(inviteTeamSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof inviteTeamSchema>;
    const email = body.email.toLowerCase();
    const instituteId = req.tenantId!;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw ApiError.conflict("A user with this email already exists");

    await assertRoleCapacity(instituteId, body.role as CappedRole);

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const member = await prisma.user.create({
      data: {
        instituteId,
        email,
        passwordHash,
        fullName: body.fullName,
        phone: body.phone,
        role: body.role,
        mustChangePassword: true,
      },
    });

    const institute = await prisma.institute.findUniqueOrThrow({ where: { id: instituteId } });

    await auditLog({
      action: "TEAM_MEMBER_INVITED",
      organizationId: req.user!.organizationId,
      instituteId,
      userId: req.user!.id,
      targetType: "User",
      targetId: member.id,
      metadata: { email, role: body.role },
    });

    const loginUrl = `${process.env.FRONTEND_URL ?? "http://127.0.0.1:3000"}/login?email=${encodeURIComponent(email)}`;
    const mailResult = await sendMail({
      to: email,
      subject: `You're set up on TutorGO — ${institute.name}`,
      html: inviteEmailHtml({
        recipientName: body.fullName,
        orgOrInstituteName: institute.name,
        email,
        tempPassword,
        role: body.role.charAt(0) + body.role.slice(1).toLowerCase(),
        loginUrl,
      }),
      purpose: "TEAM_INVITE",
      organizationId: req.user!.organizationId,
      instituteId,
    });

    res.status(201).json({
      member: { id: member.id, fullName: member.fullName, email: member.email, role: member.role },
      emailDelivered: mailResult.delivered,
      tempPassword: mailResult.delivered ? undefined : tempPassword,
    });
  } catch (err) {
    next(err);
  }
});

const updateTeamMemberSchema = z.object({
  isActive: z.boolean().optional(),
});

orgRouter.patch(
  "/team/:id",
  requireRoles("OWNER", "ADMIN"),
  validateBody(updateTeamMemberSchema),
  async (req, res, next) => {
    try {
      const member = await prisma.user.findUnique({ where: { id: req.params.id as string } });
      if (!member || member.instituteId !== req.tenantId || !TEAM_ROLES.includes(member.role as TeamRole)) {
        throw ApiError.notFound("Team member not found in this institute");
      }

      const body = req.body as z.infer<typeof updateTeamMemberSchema>;
      if (body.isActive === false && member.id === req.user!.id) {
        throw ApiError.badRequest("You can't deactivate your own account.", "SELF_DEACTIVATION");
      }

      const updated = await prisma.user.update({
        where: { id: member.id },
        data: body,
      });

      res.json({ id: updated.id, isActive: updated.isActive });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Subscription — this institute's plan and role headcount usage
// ---------------------------------------------------------------------------

orgRouter.get("/plan", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;

    // Students never get a User row (login is deferred — see changes.md §1),
    // so their headcount comes from the Student table directly, not the
    // User role groupBy that covers every other capped role.
    const [institute, roleCounts, studentCount] = await Promise.all([
      prisma.institute.findUniqueOrThrow({ where: { id: instituteId }, include: { plan: true } }),
      prisma.user.groupBy({
        by: ["role"],
        where: { instituteId, isActive: true, role: { in: ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"] } },
        _count: { _all: true },
      }),
      prisma.student.count({ where: { instituteId, isActive: true } }),
    ]);

    const used = Object.fromEntries(roleCounts.map((r) => [r.role, r._count._all]));

    if (!institute.plan) {
      return res.json({ plan: null });
    }

    res.json({
      plan: {
        code: institute.plan.code,
        name: institute.plan.name,
        description: institute.plan.description,
        limits: {
          ADMIN: { used: used.ADMIN ?? 0, max: institute.plan.maxAdmins },
          ACCOUNTANT: { used: used.ACCOUNTANT ?? 0, max: institute.plan.maxAccountants },
          FACULTY: { used: used.FACULTY ?? 0, max: institute.plan.maxFaculty },
          RECEPTION: { used: used.RECEPTION ?? 0, max: institute.plan.maxReception },
          STUDENT: { used: studentCount, max: institute.plan.maxStudents },
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// WhatsApp-ready message templates (lecture scheduled/cancelled, attendance)
// ---------------------------------------------------------------------------

orgRouter.get("/message-templates", async (req, res, next) => {
  try {
    const rows = await prisma.messageTemplate.findMany({ where: { instituteId: req.tenantId! } });
    const byType = new Map(rows.map((r) => [r.type, r.body]));

    res.json(
      MESSAGE_TEMPLATE_TYPES.map((type) => ({
        type,
        body: byType.get(type) ?? DEFAULT_MESSAGE_TEMPLATES[type],
        isDefault: !byType.has(type),
      }))
    );
  } catch (err) {
    next(err);
  }
});

const updateTemplateSchema = z.object({
  body: z.string().min(1, "Template body is required").max(2000, "Template must be 2000 characters or fewer"),
});

orgRouter.put(
  "/message-templates/:type",
  requireRoles("OWNER", "ADMIN"),
  validateBody(updateTemplateSchema),
  async (req, res, next) => {
    try {
      const rawType = req.params.type as string;
      if (!MESSAGE_TEMPLATE_TYPES.includes(rawType as (typeof MESSAGE_TEMPLATE_TYPES)[number])) {
        throw ApiError.badRequest("Unknown template type");
      }
      const type = rawType as MessageTemplateType;
      const body = (req.body as z.infer<typeof updateTemplateSchema>).body;
      const instituteId = req.tenantId!;

      const updated = await prisma.messageTemplate.upsert({
        where: { instituteId_type: { instituteId, type } },
        create: { instituteId, type, body },
        update: { body },
      });

      res.json({ type: updated.type, body: updated.body, isDefault: false });
    } catch (err) {
      next(err);
    }
  }
);

orgRouter.delete("/message-templates/:type", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const rawType = req.params.type as string;
    if (!MESSAGE_TEMPLATE_TYPES.includes(rawType as (typeof MESSAGE_TEMPLATE_TYPES)[number])) {
      throw ApiError.badRequest("Unknown template type");
    }
    const type = rawType as MessageTemplateType;
    const instituteId = req.tenantId!;

    await prisma.messageTemplate.deleteMany({ where: { instituteId, type } });
    res.json({ type, body: DEFAULT_MESSAGE_TEMPLATES[rawType as (typeof MESSAGE_TEMPLATE_TYPES)[number]], isDefault: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Institute's own outbound email (Settings → Email) — falls back to the
// platform default (services/mailer.ts) when absent or disabled, so this is
// entirely optional for an institute to ever set up.
// ---------------------------------------------------------------------------

orgRouter.get("/email-config", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const config = await prisma.instituteEmailConfig.findUnique({ where: { instituteId: req.tenantId! } });
    if (!config) return res.json(null);

    res.json({
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      isEnabled: config.isEnabled,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

const instituteEmailConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean(),
  username: z.string().min(1),
  password: z.string().optional(),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
  isEnabled: z.boolean(),
});

orgRouter.put("/email-config", requireRoles("OWNER", "ADMIN"), validateBody(instituteEmailConfigSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof instituteEmailConfigSchema>;
    const instituteId = req.tenantId!;

    if (!body.password) {
      const existing = await prisma.instituteEmailConfig.findUnique({ where: { instituteId } });
      if (!existing) throw ApiError.badRequest("Password is required for first-time setup");
      body.password = existing.password;
    }

    const config = await prisma.instituteEmailConfig.upsert({
      where: { instituteId },
      update: body as Required<typeof body>,
      create: { instituteId, ...(body as Required<typeof body>) },
    });

    invalidateInstituteEmailConfigCache(instituteId);

    await auditLog({
      action: "INSTITUTE_EMAIL_CONFIG_UPDATED",
      instituteId,
      userId: req.user!.id,
      metadata: { host: body.host, fromEmail: body.fromEmail, isEnabled: body.isEnabled },
    });

    res.json({
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      isEnabled: config.isEnabled,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Reminder broadcasts — an ad-hoc in-app notification to staff
// ---------------------------------------------------------------------------

// Students never get a User row (login is deferred), and Notification.userId
// is a required FK to User — so students structurally cannot be a broadcast
// target. TEAM_ROLES is exactly the set of roles that have accounts.
const reminderSchema = z.object({
  title: z.string().min(1, "Title is required").max(120),
  body: z.string().min(1, "Message is required").max(1000),
  roles: z.array(z.enum(TEAM_ROLES)).min(1, "Pick at least one group to notify"),
});

orgRouter.post("/reminders", requireRoles("OWNER", "ADMIN"), validateBody(reminderSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof reminderSchema>;
    const instituteId = req.tenantId!;

    const recipients = await prisma.user.findMany({
      where: { instituteId, isActive: true, role: { in: body.roles } },
      select: { id: true },
    });

    for (const r of recipients) {
      await notify({
        instituteId,
        userId: r.id,
        type: "REMINDER",
        title: body.title,
        body: body.body,
        metadata: { sentByName: req.user!.fullName },
      });
      // No-op until push is fully wired (see services/push.ts) — the in-app
      // notification above is already a complete, reliable delivery on its own.
      await sendPush({ userId: r.id, title: body.title, body: body.body });
    }

    await auditLog({
      action: "REMINDER_BROADCAST",
      instituteId,
      userId: req.user!.id,
      targetType: "Institute",
      targetId: instituteId,
      metadata: { roles: body.roles, recipients: recipients.length, title: body.title },
    });

    res.json({ sentCount: recipients.length });
  } catch (err) {
    next(err);
  }
});

/// Headcount per role, so the compose screen can show "Faculty (12)" before
/// the admin commits to sending.
orgRouter.get("/reminders/audience", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const counts = await prisma.user.groupBy({
      by: ["role"],
      where: { instituteId: req.tenantId!, isActive: true, role: { in: [...TEAM_ROLES] } },
      _count: { _all: true },
    });
    const byRole = Object.fromEntries(counts.map((c) => [c.role, c._count._all]));
    res.json(TEAM_ROLES.map((role) => ({ role, count: byRole[role] ?? 0 })));
  } catch (err) {
    next(err);
  }
});
