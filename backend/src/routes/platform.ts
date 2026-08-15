import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireSuperAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { hashPassword, generateTempPassword } from "../lib/password.js";
import { sendMail, invalidateEmailConfigCache } from "../services/mailer.js";
import { inviteEmailHtml } from "../lib/emailTemplates.js";
import { auditLog } from "../services/audit.js";
import { assertRoleCapacity } from "../services/planLimits.js";
import { instituteCodeSchema } from "./organization.js";

export const platformRouter = Router();

platformRouter.use(authenticate, requireSuperAdmin);

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

platformRouter.get("/stats", async (_req, res, next) => {
  try {
    const [organizations, activeOrganizations, institutes, tenantUsers, students, modules] = await Promise.all([
      prisma.organization.count(),
      prisma.organization.count({ where: { isActive: true } }),
      prisma.institute.count(),
      prisma.user.count({ where: { role: { in: ["OWNER", "ADMIN", "FACULTY", "RECEPTION", "STUDENT"] } } }),
      prisma.user.count({ where: { role: "STUDENT" } }),
      prisma.module.count(),
    ]);

    res.json({ organizations, activeOrganizations, institutes, tenantUsers, students, modules });
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/modules", async (_req, res, next) => {
  try {
    const modules = await prisma.module.findMany({
      include: { institutes: { where: { isActive: true } } },
      orderBy: { code: "asc" },
    });

    res.json(
      modules.map((m) => ({
        code: m.code,
        label: m.label,
        description: m.description,
        activeSubscriptions: m.institutes.length,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

platformRouter.get("/organizations", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const organizations = await prisma.organization.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: { owner: true, institutes: { select: { id: true, isActive: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      organizations.map((org) => ({
        id: org.id,
        code: org.code,
        name: org.name,
        city: org.city,
        state: org.state,
        email: org.email,
        isActive: org.isActive,
        createdAt: org.createdAt,
        ownerName: org.owner?.fullName ?? null,
        ownerEmail: org.owner?.email ?? null,
        ownerMustChangePassword: org.owner?.mustChangePassword ?? false,
        instituteCount: org.institutes.length,
        activeInstituteCount: org.institutes.filter((i) => i.isActive).length,
      }))
    );
  } catch (err) {
    next(err);
  }
});

platformRouter.get("/organizations/:id", async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        owner: true,
        institutes: {
          include: {
            modules: { include: { module: true } },
            users: { where: { role: "ADMIN" }, select: { id: true, fullName: true, email: true, isActive: true, mustChangePassword: true } },
          },
        },
      },
    });

    if (!org) throw ApiError.notFound("Organization not found");

    res.json({
      id: org.id,
      code: org.code,
      name: org.name,
      email: org.email,
      phone: org.phone,
      address: org.address,
      city: org.city,
      state: org.state,
      isActive: org.isActive,
      createdAt: org.createdAt,
      owner: org.owner
        ? {
            id: org.owner.id,
            fullName: org.owner.fullName,
            email: org.owner.email,
            phone: org.owner.phone,
            isActive: org.owner.isActive,
            mustChangePassword: org.owner.mustChangePassword,
            lastLoginAt: org.owner.lastLoginAt,
          }
        : null,
      institutes: org.institutes.map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
        city: i.city,
        isActive: i.isActive,
        onboardingDone: i.onboardingDone,
        modules: i.modules.map((m) => ({ code: m.module.code, label: m.module.label, isActive: m.isActive })),
        admins: i.users,
      })),
    });
  } catch (err) {
    next(err);
  }
});

const MODULE_CODE_ENUM = z.enum(["ENQUIRY", "ADMISSION", "ATTENDANCE", "FEES", "PAYROLL", "EXPENSE"]);

const orgCodeSchema = z
  .string()
  .min(2, "Organization code must be 2-5 characters")
  .max(5, "Organization code must be 2-5 characters")
  .regex(/^[A-Za-z0-9]+$/, "Organization code must be alphanumeric");

const personSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  phone: z.string().optional(),
});

const createOrganizationSchema = z.object({
  organization: z.object({
    name: z.string().min(1, "Organization name is required"),
    code: orgCodeSchema,
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    gstin: z.string().optional(),
  }),
  institute: z.object({
    name: z.string().min(1, "Institute name is required"),
    code: instituteCodeSchema,
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    planCode: z.string().optional(),
    modules: z.array(MODULE_CODE_ENUM).default([]),
  }),
  owner: personSchema.optional(),
  admin: personSchema.optional(),
});

platformRouter.post("/organizations", validateBody(createOrganizationSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createOrganizationSchema>;
    const orgCode = body.organization.code.toUpperCase();
    const instituteCode = body.institute.code.toUpperCase();
    const ownerEmail = body.owner?.email.toLowerCase();
    const adminEmail = body.admin?.email.toLowerCase();

    if (ownerEmail && adminEmail && ownerEmail === adminEmail) {
      throw ApiError.badRequest("Owner and admin cannot use the same email");
    }

    const [existingOrgCode, existingInstCode, allModules, plan] = await Promise.all([
      prisma.organization.findUnique({ where: { code: orgCode } }),
      prisma.institute.findUnique({ where: { code: instituteCode } }),
      prisma.module.findMany(),
      prisma.plan.findUnique({ where: { code: body.institute.planCode ?? "STARTER" } }),
    ]);
    if (existingOrgCode) throw ApiError.conflict("An organization with this code already exists");
    if (existingInstCode) throw ApiError.conflict("An institute with this code already exists");

    for (const email of [ownerEmail, adminEmail].filter((e): e is string => !!e)) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw ApiError.conflict(`A user with email ${email} already exists`);
    }

    let ownerTempPassword: string | null = null;
    let adminTempPassword: string | null = null;
    const selectedModules = new Set(body.institute.modules);

    const { org, institute } = await prisma.$transaction(async (tx) => {
      let ownerId: string | undefined;
      if (ownerEmail && body.owner) {
        ownerTempPassword = generateTempPassword();
        const owner = await tx.user.create({
          data: {
            email: ownerEmail,
            passwordHash: await hashPassword(ownerTempPassword),
            fullName: body.owner.name,
            phone: body.owner.phone,
            role: "OWNER",
            mustChangePassword: true,
          },
        });
        ownerId = owner.id;
      }

      const org = await tx.organization.create({
        data: {
          name: body.organization.name,
          code: orgCode,
          address: body.organization.address,
          city: body.organization.city,
          state: body.organization.state,
          phone: body.organization.phone,
          email: body.organization.email ?? ownerEmail,
          gstin: body.organization.gstin,
          ownerId,
        },
      });

      const institute = await tx.institute.create({
        data: {
          organizationId: org.id,
          planId: plan?.id,
          name: body.institute.name,
          code: instituteCode,
          address: body.institute.address,
          city: body.institute.city,
          state: body.institute.state,
          phone: body.institute.phone,
          email: body.institute.email,
        },
      });

      await tx.instituteModule.createMany({
        data: allModules.map((m) => ({
          instituteId: institute.id,
          moduleId: m.id,
          isActive: selectedModules.has(m.code),
        })),
      });

      if (adminEmail && body.admin) {
        adminTempPassword = generateTempPassword();
        await tx.user.create({
          data: {
            instituteId: institute.id,
            email: adminEmail,
            passwordHash: await hashPassword(adminTempPassword),
            fullName: body.admin.name,
            phone: body.admin.phone,
            role: "ADMIN",
            mustChangePassword: true,
          },
        });
      }

      return { org, institute };
    });

    await auditLog({
      action: "ORGANIZATION_CREATED",
      organizationId: org.id,
      instituteId: institute.id,
      userId: req.user!.id,
      targetType: "Organization",
      targetId: org.id,
      metadata: { code: orgCode, instituteCode, ownerEmail, adminEmail },
    });

    const baseLoginUrl = `${process.env.FRONTEND_URL ?? "http://127.0.0.1:3000"}/login`;
    let ownerInvite:
      | { emailDelivered: boolean; loginUrl: string; email: string; tempPassword: string; error?: string }
      | undefined;
    let adminInvite:
      | { emailDelivered: boolean; loginUrl: string; email: string; tempPassword: string; error?: string }
      | undefined;

    if (ownerEmail && body.owner && ownerTempPassword) {
      const loginUrl = `${baseLoginUrl}?email=${encodeURIComponent(ownerEmail)}`;
      const mailResult = await sendMail({
        to: ownerEmail,
        subject: `You're set up on TutorGO — ${body.organization.name}`,
        html: inviteEmailHtml({
          recipientName: body.owner.name,
          orgOrInstituteName: body.organization.name,
          email: ownerEmail,
          tempPassword: ownerTempPassword,
          role: "Owner",
          loginUrl,
        }),
        purpose: "OWNER_INVITE",
        organizationId: org.id,
      });
      ownerInvite = {
        emailDelivered: mailResult.delivered,
        loginUrl,
        email: ownerEmail,
        tempPassword: ownerTempPassword,
        error: mailResult.delivered ? undefined : mailResult.devFallbackNotice,
      };
    }

    if (adminEmail && body.admin && adminTempPassword) {
      const loginUrl = `${baseLoginUrl}?email=${encodeURIComponent(adminEmail)}`;
      const mailResult = await sendMail({
        to: adminEmail,
        subject: `You're set up on TutorGO — ${body.institute.name}`,
        html: inviteEmailHtml({
          recipientName: body.admin.name,
          orgOrInstituteName: body.institute.name,
          email: adminEmail,
          tempPassword: adminTempPassword,
          role: "Admin",
          loginUrl,
        }),
        purpose: "ADMIN_INVITE",
        organizationId: org.id,
        instituteId: institute.id,
      });
      adminInvite = {
        emailDelivered: mailResult.delivered,
        loginUrl,
        email: adminEmail,
        tempPassword: adminTempPassword,
        error: mailResult.delivered ? undefined : mailResult.devFallbackNotice,
      };
    }

    res.status(201).json({
      organization: { id: org.id, code: org.code, name: org.name },
      institute: { id: institute.id, code: institute.code, name: institute.name },
      ownerInvite,
      adminInvite,
    });
  } catch (err) {
    next(err);
  }
});

const addOwnerSchema = personSchema;

platformRouter.post("/organizations/:id/owner", validateBody(addOwnerSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof addOwnerSchema>;
    const email = body.email.toLowerCase();

    const org = await prisma.organization.findUnique({ where: { id: req.params.id as string } });
    if (!org) throw ApiError.notFound("Organization not found");
    if (org.ownerId) throw ApiError.conflict("This organization already has an owner");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw ApiError.conflict("A user with this email already exists");

    const tempPassword = generateTempPassword();
    const owner = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(tempPassword),
        fullName: body.name,
        phone: body.phone,
        role: "OWNER",
        mustChangePassword: true,
      },
    });
    await prisma.organization.update({ where: { id: org.id }, data: { ownerId: owner.id } });

    await auditLog({
      action: "OWNER_ADDED",
      organizationId: org.id,
      userId: req.user!.id,
      targetType: "User",
      targetId: owner.id,
      metadata: { email },
    });

    const loginUrl = `${process.env.FRONTEND_URL ?? "http://127.0.0.1:3000"}/login?email=${encodeURIComponent(email)}`;
    const mailResult = await sendMail({
      to: email,
      subject: `You're set up on TutorGO — ${org.name}`,
      html: inviteEmailHtml({
        recipientName: body.name,
        orgOrInstituteName: org.name,
        email,
        tempPassword,
        role: "Owner",
        loginUrl,
      }),
      purpose: "OWNER_INVITE",
      organizationId: org.id,
    });

    res.status(201).json({
      emailDelivered: mailResult.delivered,
      loginUrl,
      email,
      tempPassword,
      error: mailResult.delivered ? undefined : mailResult.devFallbackNotice,
    });
  } catch (err) {
    next(err);
  }
});

const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

platformRouter.patch("/organizations/:id", validateBody(updateOrganizationSchema), async (req, res, next) => {
  try {
    const org = await prisma.organization.update({
      where: { id: req.params.id as string },
      data: req.body as z.infer<typeof updateOrganizationSchema>,
    });
    res.json(org);
  } catch (err) {
    next(err);
  }
});

platformRouter.post("/organizations/:id/resend-invite", async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id }, include: { owner: true } });
    if (!org) throw ApiError.notFound("Organization not found");
    if (!org.owner) throw ApiError.notFound("This organization has no owner user");

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await prisma.user.update({
      where: { id: org.owner.id },
      data: { passwordHash, mustChangePassword: true },
    });

    const loginUrl = `${process.env.FRONTEND_URL ?? "http://127.0.0.1:3000"}/login?email=${encodeURIComponent(org.owner.email)}`;
    const mailResult = await sendMail({
      to: org.owner.email,
      subject: `Your TutorGO access has been reset — ${org.name}`,
      html: inviteEmailHtml({
        recipientName: org.owner.fullName,
        orgOrInstituteName: org.name,
        email: org.owner.email,
        tempPassword,
        role: "Owner",
        loginUrl,
      }),
      purpose: "OWNER_INVITE_RESEND",
      organizationId: org.id,
    });

    res.json({
      emailDelivered: mailResult.delivered,
      loginUrl,
      email: org.owner.email,
      tempPassword,
      error: mailResult.delivered ? undefined : mailResult.devFallbackNotice,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Institutes — platform-wide list, per-org detail, add institute, add admin
// ---------------------------------------------------------------------------

platformRouter.get("/institutes", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const institutes = await prisma.institute.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
              { organization: { name: { contains: search, mode: "insensitive" } } },
              { organization: { code: { contains: search, mode: "insensitive" } } },
            ],
          }
        : undefined,
      include: {
        organization: { select: { id: true, name: true, code: true } },
        plan: { select: { code: true, name: true } },
        modules: { where: { isActive: true } },
        users: { where: { role: "ADMIN" }, select: { id: true, mustChangePassword: true }, orderBy: { createdAt: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(
      institutes.map((i) => ({
        id: i.id,
        code: i.code,
        name: i.name,
        city: i.city,
        isActive: i.isActive,
        organization: i.organization,
        plan: i.plan,
        activeModuleCount: i.modules.length,
        onboardingDone: i.onboardingDone,
        hasAdmin: i.users.length > 0,
        adminPendingOnboarding: i.users.length > 0 && (i.users[0]!.mustChangePassword || !i.onboardingDone),
      }))
    );
  } catch (err) {
    next(err);
  }
});

const addInstituteSchema = z.object({
  name: z.string().min(1, "Institute name is required"),
  code: instituteCodeSchema,
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  planCode: z.string().optional(),
  modules: z.array(MODULE_CODE_ENUM).default([]),
});

platformRouter.post("/organizations/:id/institutes", validateBody(addInstituteSchema), async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id as string } });
    if (!org) throw ApiError.notFound("Organization not found");

    const body = req.body as z.infer<typeof addInstituteSchema>;
    const code = body.code.toUpperCase();

    const existingCode = await prisma.institute.findUnique({ where: { code } });
    if (existingCode) throw ApiError.conflict("An institute with this code already exists");

    const [allModules, plan] = await Promise.all([
      prisma.module.findMany(),
      prisma.plan.findUnique({ where: { code: body.planCode ?? "STARTER" } }),
    ]);
    const selected = new Set(body.modules);

    const institute = await prisma.$transaction(async (tx) => {
      const created = await tx.institute.create({
        data: {
          organizationId: org.id,
          planId: plan?.id,
          name: body.name,
          code,
          address: body.address,
          city: body.city,
          state: body.state,
          phone: body.phone,
          email: body.email,
        },
      });

      await tx.instituteModule.createMany({
        data: allModules.map((m) => ({ instituteId: created.id, moduleId: m.id, isActive: selected.has(m.code) })),
      });

      return created;
    });

    await auditLog({
      action: "INSTITUTE_CREATED",
      organizationId: org.id,
      instituteId: institute.id,
      userId: req.user!.id,
      targetType: "Institute",
      targetId: institute.id,
      metadata: { code },
    });

    res.status(201).json({ id: institute.id, code: institute.code, name: institute.name });
  } catch (err) {
    next(err);
  }
});

async function loadInstituteInOrg(orgId: string, instituteId: string) {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
  if (!institute || institute.organizationId !== orgId) {
    throw ApiError.notFound("Institute not found in this organization");
  }
  return institute;
}

const STAFF_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
} as const;

platformRouter.get("/organizations/:orgId/institutes/:instituteId", async (req, res, next) => {
  try {
    const institute = await loadInstituteInOrg(req.params.orgId as string, req.params.instituteId as string);

    const [modules, admins, accountants, plans, plan, roleCounts] = await Promise.all([
      prisma.instituteModule.findMany({ where: { instituteId: institute.id }, include: { module: true } }),
      prisma.user.findMany({ where: { instituteId: institute.id, role: "ADMIN" }, select: STAFF_SELECT, orderBy: { createdAt: "asc" } }),
      prisma.user.findMany({ where: { instituteId: institute.id, role: "ACCOUNTANT" }, select: STAFF_SELECT, orderBy: { createdAt: "asc" } }),
      prisma.plan.findMany({ where: { isActive: true }, orderBy: { maxStudents: "asc" } }),
      institute.planId ? prisma.plan.findUnique({ where: { id: institute.planId } }) : null,
      prisma.user.groupBy({
        by: ["role"],
        where: { instituteId: institute.id, isActive: true, role: { in: ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION", "STUDENT"] } },
        _count: { _all: true },
      }),
    ]);

    const used = Object.fromEntries(roleCounts.map((r) => [r.role, r._count._all]));

    res.json({
      id: institute.id,
      code: institute.code,
      name: institute.name,
      email: institute.email,
      phone: institute.phone,
      address: institute.address,
      city: institute.city,
      state: institute.state,
      isActive: institute.isActive,
      biometricEnabled: institute.biometricEnabled,
      onboardingDone: institute.onboardingDone,
      modules: modules.map((m) => ({ code: m.module.code, label: m.module.label, isActive: m.isActive })),
      admins,
      accountants,
      availablePlans: plans.map((p) => ({ id: p.id, code: p.code, name: p.name })),
      plan: plan
        ? {
            id: plan.id,
            code: plan.code,
            name: plan.name,
            limits: {
              ADMIN: { used: used.ADMIN ?? 0, max: plan.maxAdmins },
              ACCOUNTANT: { used: used.ACCOUNTANT ?? 0, max: plan.maxAccountants },
              FACULTY: { used: used.FACULTY ?? 0, max: plan.maxFaculty },
              RECEPTION: { used: used.RECEPTION ?? 0, max: plan.maxReception },
              STUDENT: { used: used.STUDENT ?? 0, max: plan.maxStudents },
            },
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

platformRouter.patch("/organizations/:orgId/institutes/:instituteId", async (req, res, next) => {
  try {
    const institute = await loadInstituteInOrg(req.params.orgId as string, req.params.instituteId as string);
    const body = req.body as { name?: string; address?: string; city?: string; state?: string; phone?: string; email?: string; isActive?: boolean };
    const updated = await prisma.institute.update({ where: { id: institute.id }, data: body });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

platformRouter.post(
  "/organizations/:orgId/institutes/:instituteId/admins",
  validateBody(personSchema),
  async (req, res, next) => {
    try {
      const institute = await loadInstituteInOrg(req.params.orgId as string, req.params.instituteId as string);
      const body = req.body as z.infer<typeof personSchema>;
      const email = body.email.toLowerCase();

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw ApiError.conflict("A user with this email already exists");

      await assertRoleCapacity(institute.id, "ADMIN");

      const tempPassword = generateTempPassword();
      const admin = await prisma.user.create({
        data: {
          instituteId: institute.id,
          email,
          passwordHash: await hashPassword(tempPassword),
          fullName: body.name,
          phone: body.phone,
          role: "ADMIN",
          mustChangePassword: true,
        },
      });

      await auditLog({
        action: "ADMIN_INVITED",
        organizationId: institute.organizationId,
        instituteId: institute.id,
        userId: req.user!.id,
        targetType: "User",
        targetId: admin.id,
        metadata: { email },
      });

      const loginUrl = `${process.env.FRONTEND_URL ?? "http://127.0.0.1:3000"}/login?email=${encodeURIComponent(email)}`;
      const mailResult = await sendMail({
        to: email,
        subject: `You're set up on TutorGO — ${institute.name}`,
        html: inviteEmailHtml({
          recipientName: body.name,
          orgOrInstituteName: institute.name,
          email,
          tempPassword,
          role: "Admin",
          loginUrl,
        }),
        purpose: "ADMIN_INVITE",
        organizationId: institute.organizationId,
        instituteId: institute.id,
      });

      res.status(201).json({
        emailDelivered: mailResult.delivered,
        loginUrl,
        email,
        tempPassword,
        error: mailResult.delivered ? undefined : mailResult.devFallbackNotice,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Module support (SuperAdmin can toggle any institute's modules for ops support)
// ---------------------------------------------------------------------------

const toggleModuleSchema = z.object({
  moduleCode: z.enum(["ENQUIRY", "ADMISSION", "ATTENDANCE", "FEES", "PAYROLL", "EXPENSE"]),
  isActive: z.boolean(),
});

platformRouter.post(
  "/institutes/:instituteId/toggle-module",
  validateBody(toggleModuleSchema),
  async (req, res, next) => {
    try {
      const { moduleCode, isActive } = req.body as z.infer<typeof toggleModuleSchema>;

      const moduleRow = await prisma.module.findUnique({ where: { code: moduleCode } });
      if (!moduleRow) throw ApiError.notFound("Module not found");

      const institute = await prisma.institute.findUnique({ where: { id: req.params.instituteId as string } });
      if (!institute) throw ApiError.notFound("Institute not found");

      const updated = await prisma.instituteModule.upsert({
        where: { instituteId_moduleId: { instituteId: institute.id, moduleId: moduleRow.id } },
        update: { isActive },
        create: { instituteId: institute.id, moduleId: moduleRow.id, isActive },
      });

      await auditLog({
        action: "MODULE_TOGGLED",
        organizationId: institute.organizationId,
        instituteId: institute.id,
        userId: req.user!.id,
        targetType: "Module",
        targetId: moduleRow.id,
        metadata: { moduleCode, isActive },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

const assignPlanSchema = z.object({
  planId: z.string().nullable(),
});

platformRouter.patch("/institutes/:instituteId/plan", validateBody(assignPlanSchema), async (req, res, next) => {
  try {
    const { planId } = req.body as z.infer<typeof assignPlanSchema>;

    const institute = await prisma.institute.findUnique({ where: { id: req.params.instituteId as string } });
    if (!institute) throw ApiError.notFound("Institute not found");

    if (planId) {
      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) throw ApiError.notFound("Plan not found");
    }

    const updated = await prisma.institute.update({ where: { id: institute.id }, data: { planId } });

    await auditLog({
      action: "INSTITUTE_PLAN_CHANGED",
      organizationId: institute.organizationId,
      instituteId: institute.id,
      userId: req.user!.id,
      targetType: "Institute",
      targetId: institute.id,
      metadata: { planId },
    });

    res.json({ id: updated.id, planId: updated.planId });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Plans — role headcount limits, assigned per institute
// ---------------------------------------------------------------------------

platformRouter.get("/plans", async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({
      include: { institutes: { select: { id: true } } },
      orderBy: { maxStudents: "asc" },
    });

    res.json(
      plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        maxAdmins: p.maxAdmins,
        maxAccountants: p.maxAccountants,
        maxFaculty: p.maxFaculty,
        maxReception: p.maxReception,
        maxStudents: p.maxStudents,
        isActive: p.isActive,
        instituteCount: p.institutes.length,
      }))
    );
  } catch (err) {
    next(err);
  }
});

const planSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Za-z0-9_]+$/, "Plan code must be alphanumeric"),
  name: z.string().min(1),
  description: z.string().optional(),
  maxAdmins: z.number().int().min(0),
  maxAccountants: z.number().int().min(0),
  maxFaculty: z.number().int().min(0),
  maxReception: z.number().int().min(0),
  maxStudents: z.number().int().min(0),
});

platformRouter.post("/plans", validateBody(planSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof planSchema>;
    const code = body.code.toUpperCase();

    const existing = await prisma.plan.findUnique({ where: { code } });
    if (existing) throw ApiError.conflict("A plan with this code already exists");

    const plan = await prisma.plan.create({ data: { ...body, code } });
    res.status(201).json(plan);
  } catch (err) {
    next(err);
  }
});

const updatePlanSchema = planSchema.partial().extend({ isActive: z.boolean().optional() });

platformRouter.patch("/plans/:id", validateBody(updatePlanSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof updatePlanSchema>;
    const plan = await prisma.plan.update({
      where: { id: req.params.id as string },
      data: { ...body, code: body.code ? body.code.toUpperCase() : undefined },
    });
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

platformRouter.delete("/plans/:id", async (req, res, next) => {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: req.params.id as string },
      include: { institutes: { select: { id: true } } },
    });
    if (!plan) throw ApiError.notFound("Plan not found");
    if (plan.institutes.length > 0) {
      throw ApiError.conflict("This plan is still assigned to one or more institutes — reassign them first");
    }

    await prisma.plan.delete({ where: { id: plan.id } });

    await auditLog({
      action: "PLAN_DELETED",
      userId: req.user!.id,
      targetType: "Plan",
      targetId: plan.id,
      metadata: { code: plan.code },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Global SMTP config
// ---------------------------------------------------------------------------

platformRouter.get("/email-config", async (_req, res, next) => {
  try {
    const config = await prisma.emailConfig.findUnique({ where: { id: "default" } });
    if (!config) return res.json(null);

    res.json({
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

const emailConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean(),
  username: z.string().min(1),
  password: z.string().optional(),
  fromName: z.string().min(1),
  fromEmail: z.string().email(),
});

platformRouter.put("/email-config", validateBody(emailConfigSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof emailConfigSchema>;

    if (!body.password) {
      const existing = await prisma.emailConfig.findUnique({ where: { id: "default" } });
      if (!existing) throw ApiError.badRequest("Password is required for first-time setup");
      body.password = existing.password;
    }

    const config = await prisma.emailConfig.upsert({
      where: { id: "default" },
      update: body as Required<typeof body>,
      create: { id: "default", ...(body as Required<typeof body>) },
    });

    invalidateEmailConfigCache();

    await auditLog({
      action: "EMAIL_CONFIG_UPDATED",
      userId: req.user!.id,
      metadata: { host: body.host, fromEmail: body.fromEmail },
    });

    res.json({
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      fromName: config.fromName,
      fromEmail: config.fromEmail,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});
