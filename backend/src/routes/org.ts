import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { hashPassword, generateTempPassword } from "../lib/password.js";
import { sendMail } from "../services/mailer.js";
import { inviteEmailHtml } from "../lib/emailTemplates.js";
import { auditLog } from "../services/audit.js";
import { assertRoleCapacity, type CappedRole } from "../services/planLimits.js";

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

    const loginUrl = `${process.env.FRONTEND_URL ?? "http://127.0.0.1:3000"}/login`;
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

      const updated = await prisma.user.update({
        where: { id: member.id },
        data: req.body as z.infer<typeof updateTeamMemberSchema>,
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

    const [institute, roleCounts] = await Promise.all([
      prisma.institute.findUniqueOrThrow({ where: { id: instituteId }, include: { plan: true } }),
      prisma.user.groupBy({
        by: ["role"],
        where: { instituteId, isActive: true, role: { in: ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION", "STUDENT"] } },
        _count: { _all: true },
      }),
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
          STUDENT: { used: used.STUDENT ?? 0, max: institute.plan.maxStudents },
        },
      },
    });
  } catch (err) {
    next(err);
  }
});
