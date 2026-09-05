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
import { assertRoleCapacity, countUsage } from "../services/planLimits.js";
import {
  CAPPED_ROLES,
  effectiveLimits,
  isCustomised,
  planLimits,
  type CappedRole,
} from "../lib/instituteLimits.js";
import { seedDefaultExpenseCategories } from "../lib/expenseDefaults.js";
import { instituteCodeSchema } from "./organization.js";
import { notifyTicketCreatorOfReply } from "./support.js";
import { buildInstituteExportArchive } from "../services/instituteExport.js";
import type { Role } from "../generated/prisma/enums.js";

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

// ---------------------------------------------------------------------------
// Platform health — see changes-phase14.md §14.1. Aggregation over
// OutboundMessage (WhatsApp) and MessageLog (email), both already written on
// every send attempt elsewhere in the app; no new tracking, no new writes.
// ---------------------------------------------------------------------------

platformRouter.get("/health", async (req, res, next) => {
  try {
    // Defaults to the last 30 days — long enough to see a pattern, short
    // enough that one bad afternoon three months ago doesn't keep dragging
    // an institute's numbers down forever.
    const to = req.query.to && typeof req.query.to === "string" ? new Date(req.query.to) : new Date();
    const from =
      req.query.from && typeof req.query.from === "string"
        ? new Date(req.query.from)
        : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const range = { createdAt: { gte: from, lte: to } };

    const [whatsappByInstitute, emailByInstitute, institutes] = await Promise.all([
      prisma.outboundMessage.groupBy({
        by: ["instituteId", "status"],
        where: range,
        _count: { _all: true },
      }),
      prisma.messageLog.groupBy({
        by: ["instituteId", "delivered"],
        // MessageLog.instituteId is nullable (platform-level mail, e.g. a
        // support-ticket notice, has none) — those rows have nowhere to
        // attribute a failure to, so they're excluded from the per-institute
        // breakdown but would still count toward a true platform-wide total
        // if this ever needs one. Institute-scoped mail is the case this
        // dashboard is actually for: "is institute X's email broken."
        where: { ...range, instituteId: { not: null } },
        _count: { _all: true },
      }),
      prisma.institute.findMany({ select: { id: true, name: true, organization: { select: { name: true } } } }),
    ]);

    const instituteById = new Map(institutes.map((i) => [i.id, i]));

    // One row per institute that shows up in either channel, folding
    // WhatsApp's three-way status and email's boolean into the same
    // sent/failed shape so the two channels compare directly.
    type Row = { instituteId: string; whatsappSent: number; whatsappFailed: number; emailSent: number; emailFailed: number };
    const rows = new Map<string, Row>();
    function rowFor(instituteId: string): Row {
      let row = rows.get(instituteId);
      if (!row) {
        row = { instituteId, whatsappSent: 0, whatsappFailed: 0, emailSent: 0, emailFailed: 0 };
        rows.set(instituteId, row);
      }
      return row;
    }

    for (const g of whatsappByInstitute) {
      if (!g.instituteId) continue;
      const row = rowFor(g.instituteId);
      if (g.status === "SENT") row.whatsappSent += g._count._all;
      else if (g.status === "FAILED") row.whatsappFailed += g._count._all;
      // QUEUED is neither sent nor failed yet — deliberately excluded from
      // both the numerator and denominator of a failure rate, since a
      // message still in flight isn't a failure.
    }
    for (const g of emailByInstitute) {
      if (!g.instituteId) continue;
      const row = rowFor(g.instituteId);
      if (g.delivered) row.emailSent += g._count._all;
      else row.emailFailed += g._count._all;
    }

    const institutesOut = [...rows.values()]
      .map((r) => {
        const whatsappTotal = r.whatsappSent + r.whatsappFailed;
        const emailTotal = r.emailSent + r.emailFailed;
        return {
          instituteId: r.instituteId,
          instituteName: instituteById.get(r.instituteId)?.name ?? "Unknown institute",
          organizationName: instituteById.get(r.instituteId)?.organization.name ?? null,
          whatsapp: { sent: r.whatsappSent, failed: r.whatsappFailed, total: whatsappTotal, failureRate: whatsappTotal ? r.whatsappFailed / whatsappTotal : 0 },
          email: { sent: r.emailSent, failed: r.emailFailed, total: emailTotal, failureRate: emailTotal ? r.emailFailed / emailTotal : 0 },
        };
      })
      // Worst-first by whichever channel is worse for that institute — the
      // point of this table is "which institute needs a call," not a stable
      // alphabetical list.
      .sort((a, b) => Math.max(b.whatsapp.failureRate, b.email.failureRate) - Math.max(a.whatsapp.failureRate, a.email.failureRate));

    const overall = institutesOut.reduce(
      (acc, i) => ({
        whatsappSent: acc.whatsappSent + i.whatsapp.sent,
        whatsappFailed: acc.whatsappFailed + i.whatsapp.failed,
        emailSent: acc.emailSent + i.email.sent,
        emailFailed: acc.emailFailed + i.email.failed,
      }),
      { whatsappSent: 0, whatsappFailed: 0, emailSent: 0, emailFailed: 0 }
    );
    const whatsappTotal = overall.whatsappSent + overall.whatsappFailed;
    const emailTotal = overall.emailSent + overall.emailFailed;

    res.json({
      from,
      to,
      overall: {
        whatsapp: { sent: overall.whatsappSent, failed: overall.whatsappFailed, total: whatsappTotal, failureRate: whatsappTotal ? overall.whatsappFailed / whatsappTotal : 0 },
        email: { sent: overall.emailSent, failed: overall.emailFailed, total: emailTotal, failureRate: emailTotal ? overall.emailFailed / emailTotal : 0 },
      },
      institutes: institutesOut,
    });
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
          // Snapshot the plan's limits onto the institute at creation — from
          // here the institute owns them and later Plan edits don't reach it.
          // See lib/instituteLimits.ts.
          maxAdmins: plan?.maxAdmins ?? null,
          maxAccountants: plan?.maxAccountants ?? null,
          maxFaculty: plan?.maxFaculty ?? null,
          maxReception: plan?.maxReception ?? null,
          maxStudents: plan?.maxStudents ?? null,
          planLimitsSetAt: plan ? new Date() : null,
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

      await seedDefaultExpenseCategories(tx, institute.id);

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
          // Snapshot the plan's limits onto the institute at creation — from
          // here the institute owns them and later Plan edits don't reach it.
          // See lib/instituteLimits.ts.
          maxAdmins: plan?.maxAdmins ?? null,
          maxAccountants: plan?.maxAccountants ?? null,
          maxFaculty: plan?.maxFaculty ?? null,
          maxReception: plan?.maxReception ?? null,
          maxStudents: plan?.maxStudents ?? null,
          planLimitsSetAt: plan ? new Date() : null,
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

      await seedDefaultExpenseCategories(tx, created.id);

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

    const [modules, admins, accountants, plans, plan, used] = await Promise.all([
      prisma.instituteModule.findMany({ where: { instituteId: institute.id }, include: { module: true } }),
      prisma.user.findMany({ where: { instituteId: institute.id, role: "ADMIN" }, select: STAFF_SELECT, orderBy: { createdAt: "asc" } }),
      prisma.user.findMany({ where: { instituteId: institute.id, role: "ACCOUNTANT" }, select: STAFF_SELECT, orderBy: { createdAt: "asc" } }),
      prisma.plan.findMany({ where: { isActive: true }, orderBy: { maxStudents: "asc" } }),
      institute.planId ? prisma.plan.findUnique({ where: { id: institute.planId } }) : null,
      countUsage(institute.id),
    ]);

    const limits = effectiveLimits({ ...institute, plan });

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
      availablePlans: plans.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        // The plan's headline numbers, so the UI can show what re-assigning
        // this plan would snapshot onto the institute.
        limits: planLimits(p),
      })),
      // `limits` is what is actually ENFORCED — the institute's own snapshot.
      // `plan` is only where those numbers originally came from; the two drift
      // apart the moment either the plan or the institute is edited, and
      // `customised` is what says so.
      limits: limits
        ? CAPPED_ROLES.reduce(
            (acc, role) => {
              acc[role] = { used: used[role], max: limits[role] };
              return acc;
            },
            {} as Record<CappedRole, { used: number; max: number }>
          )
        : null,
      customised: isCustomised({ ...institute, plan }),
      planLimitsSetAt: institute.planLimitsSetAt,
      plan: plan
        ? { id: plan.id, code: plan.code, name: plan.name, limits: planLimits(plan) }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

/** Suspension is the only way an institute is ever taken out of service —
 * there is deliberately no delete endpoint, here or anywhere else. An institute
 * owns fee ledgers, receipts, payroll and attendance history that must remain
 * auditable, so `isActive: false` is the terminal state. Flipping it off is
 * enforced immediately: middleware/auth.ts rejects existing tokens bound to a
 * suspended institute, and /auth/enter-institute refuses to issue new ones. */
const updateInstituteSchema = z
  .object({
    name: z.string().min(1).optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    isActive: z.boolean().optional(),
    // Required only for the suspend direction — see changes-phase12.md
    // §12.10. Reactivating doesn't need a reason of its own; the reason
    // that matters there is already on the suspension row being lifted.
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((v) => v.isActive !== false || !!v.reason, {
    message: "A reason is required to suspend an institute",
    path: ["reason"],
  });

platformRouter.patch(
  "/organizations/:orgId/institutes/:instituteId",
  validateBody(updateInstituteSchema),
  async (req, res, next) => {
    try {
      const institute = await loadInstituteInOrg(req.params.orgId as string, req.params.instituteId as string);
      // Explicit field list rather than spreading the body into Prisma —
      // otherwise any column on Institute (organizationId, code, planId) would
      // be settable through this endpoint.
      const body = req.body as z.infer<typeof updateInstituteSchema>;

      const [updated] = await prisma.$transaction([
        prisma.institute.update({
          where: { id: institute.id },
          data: {
            name: body.name,
            address: body.address,
            city: body.city,
            state: body.state,
            phone: body.phone,
            email: body.email,
            isActive: body.isActive,
          },
        }),
        // Suspending: one new open row. Reactivating: close out whichever
        // suspension row is still open (there's only ever at most one, since
        // suspend/reactivate strictly alternate) rather than trusting the
        // caller to know which row that is.
        ...(body.isActive === false
          ? [
              prisma.instituteSuspension.create({
                data: { instituteId: institute.id, reason: body.reason!, suspendedByUserId: req.user!.id },
              }),
            ]
          : []),
        ...(body.isActive === true
          ? [
              prisma.instituteSuspension.updateMany({
                where: { instituteId: institute.id, liftedAt: null },
                data: { liftedAt: new Date(), liftedByUserId: req.user!.id },
              }),
            ]
          : []),
      ]);

      if (body.isActive !== undefined) {
        await auditLog({
          action: body.isActive ? "INSTITUTE_REACTIVATED" : "INSTITUTE_SUSPENDED",
          organizationId: institute.organizationId,
          instituteId: institute.id,
          userId: req.user!.id,
          targetType: "Institute",
          targetId: institute.id,
          metadata: body.isActive ? undefined : { reason: body.reason },
        });
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.get("/institutes/:id/suspensions", async (req, res, next) => {
  try {
    const suspensions = await prisma.instituteSuspension.findMany({
      where: { instituteId: req.params.id as string },
      include: {
        suspendedBy: { select: { id: true, fullName: true } },
        liftedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { suspendedAt: "desc" },
    });
    res.json(suspensions);
  } catch (err) {
    next(err);
  }
});

/** The SuperAdmin-side twin of GET /org/export (changes-phase14.md §14.2) —
 * same bundle, for the support/offboarding case where an owner can't or
 * won't pull their own export (e.g. an institute is being wound down after
 * suspension). Placed alongside the suspension routes above rather than
 * elsewhere in this file since that's the actual use case: "this institute
 * is leaving/being suspended, get a copy of their data first." Audit-logged,
 * unlike the self-service route — a SuperAdmin reading through every
 * institute's financial records is exactly the kind of action §12.7's
 * viewer exists to make visible. */
platformRouter.get("/institutes/:id/export", async (req, res, next) => {
  try {
    const instituteId = req.params.id as string;
    const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
    if (!institute) throw ApiError.notFound("Institute not found");

    await auditLog({
      action: "INSTITUTE_DATA_EXPORTED",
      organizationId: institute.organizationId,
      instituteId,
      userId: req.user!.id,
      targetType: "Institute",
      targetId: instituteId,
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="institute-export-${institute.code}.zip"`);
    const archive = buildInstituteExportArchive(instituteId);
    archive.on("error", next);
    archive.pipe(res);
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

    let plan = null;
    if (planId) {
      plan = await prisma.plan.findUnique({ where: { id: planId } });
      if (!plan) throw ApiError.notFound("Plan not found");
    }

    // Assigning a plan SNAPSHOTS its limits onto the institute. From here the
    // institute owns those numbers: later edits to the Plan row change what
    // new assignments copy, and nothing else. Re-assigning the same plan is
    // therefore also the way to deliberately pull an institute back onto the
    // plan's current numbers, discarding any per-institute override.
    // Clearing the plan (planId: null) clears the snapshot with it, which
    // makes the institute unlimited — matching the previous no-plan behaviour.
    const updated = await prisma.institute.update({
      where: { id: institute.id },
      data: {
        planId,
        maxAdmins: plan?.maxAdmins ?? null,
        maxAccountants: plan?.maxAccountants ?? null,
        maxFaculty: plan?.maxFaculty ?? null,
        maxReception: plan?.maxReception ?? null,
        maxStudents: plan?.maxStudents ?? null,
        planLimitsSetAt: plan ? new Date() : null,
      },
    });

    await auditLog({
      action: "INSTITUTE_PLAN_CHANGED",
      organizationId: institute.organizationId,
      instituteId: institute.id,
      userId: req.user!.id,
      targetType: "Institute",
      targetId: institute.id,
      metadata: { planId, snapshot: plan ? planLimits(plan) : null },
    });

    res.json({ id: updated.id, planId: updated.planId, limits: effectiveLimits({ ...updated, plan }) });
  } catch (err) {
    next(err);
  }
});

/** Platform-wide user directory: name, email and role for every account, with
 * the organization/institute each belongs to so a support request ("who is
 * bob@… and what can he do?") is answerable from one screen. Deliberately
 * returns no password or token material — identity and role only. */
platformRouter.get("/users", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const role = typeof req.query.role === "string" ? req.query.role : undefined;
    const instituteId = typeof req.query.instituteId === "string" ? req.query.instituteId : undefined;
    const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
    // Defaults to active-only — the directory is for "who has access right
    // now"; deactivated accounts are opt-in via ?includeInactive=true.
    const includeInactive = req.query.includeInactive === "true";
    const take = Math.min(Number(req.query.limit) || 100, 500);

    const users = await prisma.user.findMany({
      // Collected as AND clauses rather than merged into one object: the org
      // filter and the search filter each need their own OR, and two `OR` keys
      // on the same object would silently overwrite each other.
      where: {
        AND: [
          ...(includeInactive ? [] : [{ isActive: true }]),
          ...(role ? [{ role: role as Role }] : []),
          ...(instituteId ? [{ instituteId }] : []),
          // An OWNER has no instituteId — they hang off the Organization they
          // own — so filtering by organization has to reach through both
          // relations, or an org's own owner is missing from its user list.
          ...(organizationId
            ? [{ OR: [{ institute: { organizationId } }, { ownedOrganization: { id: organizationId } }] }]
            : []),
          ...(q
            ? [
                {
                  OR: [
                    { fullName: { contains: q, mode: "insensitive" as const } },
                    { email: { contains: q, mode: "insensitive" as const } },
                  ],
                },
              ]
            : []),
        ],
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        mfaEnabledAt: true,
        institute: { select: { id: true, name: true, code: true, organization: { select: { id: true, name: true } } } },
        ownedOrganization: { select: { id: true, name: true } },
      },
      orderBy: [{ role: "asc" }, { fullName: "asc" }],
      take,
    });

    res.json(
      users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        mfaEnabled: !!u.mfaEnabledAt,
        instituteId: u.institute?.id ?? null,
        instituteName: u.institute?.name ?? null,
        instituteCode: u.institute?.code ?? null,
        // For an OWNER the organization comes from the one they own, not from
        // an institute — they belong to no single institute.
        organizationName: u.institute?.organization.name ?? u.ownedOrganization?.name ?? null,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Audit log viewer — see changes-phase12.md §12.7. Read-only over rows
// already written from org.ts/platform.ts; no new write path.
// ---------------------------------------------------------------------------

const AUDIT_LOG_PAGE_SIZE = 50;

platformRouter.get("/audit-log", async (req, res, next) => {
  try {
    const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
    const instituteId = typeof req.query.instituteId === "string" ? req.query.instituteId : undefined;
    const action = typeof req.query.action === "string" ? req.query.action : undefined;
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    // Offset pagination is fine here — this is a SuperAdmin triage tool
    // paging through at most a few thousand rows at a time, not a hot path
    // that needs a keyset cursor.
    const page = Math.max(1, Number(req.query.page) || 1);

    const where = {
      ...(organizationId ? { organizationId } : {}),
      ...(instituteId ? { instituteId } : {}),
      ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * AUDIT_LOG_PAGE_SIZE,
        take: AUDIT_LOG_PAGE_SIZE,
      }),
    ]);

    // AuditLog.userId/organizationId/instituteId are plain columns, not
    // relations (a log row must survive the thing it references being
    // deleted) — so actor/org/institute names are resolved with one batched
    // lookup per page rather than a join, and missing ones (a deleted user,
    // say) just render as "—" on the frontend.
    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
    const orgIds = [...new Set(rows.map((r) => r.organizationId).filter((id): id is string => !!id))];
    const instIds = [...new Set(rows.map((r) => r.instituteId).filter((id): id is string => !!id))];

    const [users, orgs, insts] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, email: true } }) : [],
      orgIds.length ? prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [],
      instIds.length ? prisma.institute.findMany({ where: { id: { in: instIds } }, select: { id: true, name: true } }) : [],
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const orgById = new Map(orgs.map((o) => [o.id, o]));
    const instById = new Map(insts.map((i) => [i.id, i]));

    res.json({
      total,
      page,
      pageSize: AUDIT_LOG_PAGE_SIZE,
      rows: rows.map((r) => ({
        id: r.id,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        metadata: r.metadata,
        createdAt: r.createdAt,
        actor: r.userId ? (userById.get(r.userId) ?? { id: r.userId, fullName: "Deleted user", email: "" }) : null,
        organization: r.organizationId ? (orgById.get(r.organizationId) ?? null) : null,
        institute: r.instituteId ? (instById.get(r.instituteId) ?? null) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Global search — see changes-phase12.md §12.9. "Which institute is this
// phone number in" without guessing which organization to open first.
// ---------------------------------------------------------------------------

platformRouter.get("/search", async (req, res, next) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 2) return res.json({ students: [], users: [], institutes: [], organizations: [] });

    const contains = { contains: q, mode: "insensitive" as const };

    const [students, users, institutes, organizations] = await Promise.all([
      prisma.student.findMany({
        where: { OR: [{ name: contains }, { email: contains }, { phone: contains }, { parentPhone: contains }] },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          studentCode: true,
          institute: { select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } } },
        },
        take: 20,
      }),
      prisma.user.findMany({
        where: { OR: [{ fullName: contains }, { email: contains }] },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          institute: { select: { id: true, name: true, organizationId: true, organization: { select: { name: true } } } },
          ownedOrganization: { select: { id: true, name: true } },
        },
        take: 20,
      }),
      prisma.institute.findMany({
        where: { OR: [{ name: contains }, { code: contains }] },
        select: { id: true, name: true, code: true, organizationId: true, organization: { select: { name: true } } },
        take: 20,
      }),
      prisma.organization.findMany({
        where: { OR: [{ name: contains }, { code: contains }] },
        select: { id: true, name: true, code: true },
        take: 20,
      }),
    ]);

    res.json({
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        studentCode: s.studentCode,
        instituteId: s.institute.id,
        instituteName: s.institute.name,
        organizationId: s.institute.organizationId,
        organizationName: s.institute.organization.name,
      })),
      users: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        role: u.role,
        instituteId: u.institute?.id ?? null,
        instituteName: u.institute?.name ?? null,
        organizationId: u.institute?.organizationId ?? u.ownedOrganization?.id ?? null,
        organizationName: u.institute?.organization.name ?? u.ownedOrganization?.name ?? null,
      })),
      institutes: institutes.map((i) => ({
        id: i.id,
        name: i.name,
        code: i.code,
        organizationId: i.organizationId,
        organizationName: i.organization.name,
      })),
      organizations: organizations.map((o) => ({ id: o.id, name: o.name, code: o.code })),
    });
  } catch (err) {
    next(err);
  }
});

/** Forces every session on this account to sign out on its next request —
 * the platform-side lever for a compromised account, usable without waiting
 * for the account holder to do it themselves. Same mechanism as the
 * self-service /auth/logout-everywhere: bump tokenVersion, nothing else.
 * See changes-phase12.md §12.2. */
platformRouter.post("/users/:id/logout-everywhere", async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!target) throw ApiError.notFound("User not found");

    await prisma.user.update({ where: { id: target.id }, data: { tokenVersion: { increment: 1 } } });

    await auditLog({
      action: "USER_FORCED_LOGOUT",
      organizationId: null,
      instituteId: target.instituteId,
      userId: req.user!.id,
      targetType: "User",
      targetId: target.id,
      metadata: { email: target.email },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/** The escape hatch flagged in changes-phase12.md §12.6's risk section: the
 * "I lost my phone and my backup codes" case, which otherwise has no
 * recovery path at all — backup codes are the only self-service route, and
 * once those are also gone the account is genuinely stuck without this.
 * Requires a reason, same bar as suspending an institute (§12.10), because
 * this is itself a new attack surface: a compromised SuperAdmin account
 * could use it to strip any owner's second factor before taking over. */
const disableMfaSchema = z.object({ reason: z.string().trim().min(1, "A reason is required").max(500) });

platformRouter.post("/users/:id/mfa/disable", validateBody(disableMfaSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof disableMfaSchema>;
    const target = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!target) throw ApiError.notFound("User not found");
    if (!target.mfaEnabledAt) throw ApiError.badRequest("This account doesn't have two-factor authentication enabled");

    await prisma.user.update({
      where: { id: target.id },
      data: { mfaSecret: null, mfaEnabledAt: null, mfaBackupCodes: [] },
    });

    await auditLog({
      action: "USER_MFA_DISABLED",
      organizationId: null,
      instituteId: target.instituteId,
      userId: req.user!.id,
      targetType: "User",
      targetId: target.id,
      metadata: { email: target.email, reason: body.reason },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Help & support triage queue — see changes-phase12.md §12.3.
// ---------------------------------------------------------------------------

const supportTicketSummarySelect = {
  id: true,
  category: true,
  subject: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  organization: { select: { id: true, name: true } },
  institute: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  _count: { select: { messages: true } },
} as const;

platformRouter.get("/support/tickets", async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;

    const tickets = await prisma.supportTicket.findMany({
      where: {
        ...(status ? { status: status as "OPEN" | "IN_PROGRESS" | "RESOLVED" } : {}),
        ...(category ? { category: category as "BILLING" | "BUG" | "FEATURE_REQUEST" | "OTHER" } : {}),
      },
      select: supportTicketSummarySelect,
      // Open-and-oldest-first: an unanswered ticket sitting the longest is
      // the one most likely to have been missed, so it surfaces at the top
      // of the queue rather than the most recently touched one.
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    res.json(tickets);
  } catch (err) {
    next(err);
  }
});

async function loadTicketOrThrow(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, fullName: true } } } } },
  });
  if (!ticket) throw ApiError.notFound("Ticket not found");
  return ticket;
}

platformRouter.get("/support/tickets/:id", async (req, res, next) => {
  try {
    res.json(await loadTicketOrThrow(req.params.id as string));
  } catch (err) {
    next(err);
  }
});

const updateTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
});

platformRouter.patch("/support/tickets/:id", validateBody(updateTicketSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof updateTicketSchema>;
    const ticket = await loadTicketOrThrow(req.params.id as string);
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: body.status },
      select: supportTicketSummarySelect,
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

const platformReplySchema = z.object({ body: z.string().trim().min(1, "Message is required").max(5000) });

platformRouter.post("/support/tickets/:id/messages", validateBody(platformReplySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof platformReplySchema>;
    const ticket = await loadTicketOrThrow(req.params.id as string);

    await prisma.$transaction([
      prisma.supportTicketMessage.create({
        data: { ticketId: ticket.id, authorUserId: req.user!.id, isFromPlatform: true, body: body.body },
      }),
      // A SuperAdmin's reply is exactly the "someone is now on this" moment —
      // an OPEN ticket that's just been answered isn't still merely open.
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status },
      }),
    ]);

    await notifyTicketCreatorOfReply({
      id: ticket.id,
      subject: ticket.subject,
      instituteId: ticket.instituteId,
      createdByUserId: ticket.createdByUserId,
    });

    res.status(201).json(await loadTicketOrThrow(ticket.id));
  } catch (err) {
    next(err);
  }
});

const instituteLimitsSchema = z
  .object({
    maxAdmins: z.number().int().min(0).max(100_000).optional(),
    maxAccountants: z.number().int().min(0).max(100_000).optional(),
    maxFaculty: z.number().int().min(0).max(100_000).optional(),
    maxReception: z.number().int().min(0).max(100_000).optional(),
    maxStudents: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((v) => Object.values(v).some((n) => n !== undefined), {
    message: "Provide at least one limit to change",
  });

/** Raises (or lowers) one institute's headcount limits without touching the
 * Plan every other institute shares — the usual case being "this one customer
 * needs 40 faculty, everyone else on Standard stays at 5". Lowering below
 * current usage is allowed on purpose: it stops further additions rather than
 * deactivating anyone, and the response reports the overage so the platform
 * admin can see what they've done. */
platformRouter.patch(
  "/institutes/:instituteId/limits",
  validateBody(instituteLimitsSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof instituteLimitsSchema>;
      const institute = await prisma.institute.findUnique({
        where: { id: req.params.instituteId as string },
        include: { plan: true },
      });
      if (!institute) throw ApiError.notFound("Institute not found");

      // Merge onto the current effective limits rather than writing only the
      // supplied fields: an institute that was never snapshotted would
      // otherwise end up half-null and silently unlimited on the rest.
      const current = effectiveLimits(institute) ?? {
        ADMIN: 0,
        ACCOUNTANT: 0,
        FACULTY: 0,
        RECEPTION: 0,
        STUDENT: 0,
      };

      const updated = await prisma.institute.update({
        where: { id: institute.id },
        data: {
          maxAdmins: body.maxAdmins ?? current.ADMIN,
          maxAccountants: body.maxAccountants ?? current.ACCOUNTANT,
          maxFaculty: body.maxFaculty ?? current.FACULTY,
          maxReception: body.maxReception ?? current.RECEPTION,
          maxStudents: body.maxStudents ?? current.STUDENT,
          planLimitsSetAt: new Date(),
        },
        include: { plan: true },
      });

      await auditLog({
        action: "INSTITUTE_LIMITS_OVERRIDDEN",
        organizationId: institute.organizationId,
        instituteId: institute.id,
        userId: req.user!.id,
        targetType: "Institute",
        targetId: institute.id,
        metadata: { before: current, after: effectiveLimits(updated) },
      });

      const used = await countUsage(institute.id);
      const limits = effectiveLimits(updated)!;

      res.json({
        id: updated.id,
        planLimitsSetAt: updated.planLimitsSetAt,
        customised: isCustomised(updated),
        limits: CAPPED_ROLES.reduce(
          (acc, role) => {
            acc[role] = { used: used[role] ?? 0, max: limits[role] };
            return acc;
          },
          {} as Record<CappedRole, { used: number; max: number }>
        ),
      });
    } catch (err) {
      next(err);
    }
  }
);

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

// ---------------------------------------------------------------------------
// Subscriptions — one screen for every institute's plan, usage and modules
// ---------------------------------------------------------------------------

/// Rolls up every institute with its plan, live headcount against each cap,
/// and active modules, so the platform admin can see who's at their limit
/// (and who should be upsold) without opening each institute one at a time.
platformRouter.get("/subscriptions", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const planCode = typeof req.query.planCode === "string" ? req.query.planCode : undefined;

    const institutes = await prisma.institute.findMany({
      where: {
        planId: planCode ? (await prisma.plan.findUnique({ where: { code: planCode } }))?.id ?? "__none__" : undefined,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
                { organization: { name: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        organization: { select: { id: true, name: true, code: true } },
        plan: true,
        modules: { where: { isActive: true }, include: { module: { select: { code: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });

    const [roleCounts, studentCounts] = await Promise.all([
      prisma.user.groupBy({
        by: ["instituteId", "role"],
        where: { isActive: true, role: { in: ["ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"] } },
        _count: { _all: true },
      }),
      prisma.student.groupBy({ by: ["instituteId"], where: { isActive: true }, _count: { _all: true } }),
    ]);

    const usedByInstitute = new Map<string, Record<string, number>>();
    for (const row of roleCounts) {
      if (!row.instituteId) continue;
      const entry = usedByInstitute.get(row.instituteId) ?? {};
      entry[row.role] = row._count._all;
      usedByInstitute.set(row.instituteId, entry);
    }
    const studentsByInstitute = new Map(studentCounts.map((s) => [s.instituteId, s._count._all]));

    res.json(
      institutes.map((i) => {
        const used = usedByInstitute.get(i.id) ?? {};
        const students = studentsByInstitute.get(i.id) ?? 0;
        // The institute's OWN limits, not the plan's — those two drift apart
        // as soon as a plan is edited or an institute is given a bespoke cap,
        // and this column is what a platform admin reads to decide whether
        // someone has outgrown their tier. See lib/instituteLimits.ts.
        const effective = effectiveLimits(i);
        const usedByRole = { ...used, STUDENT: students } as Record<CappedRole, number | undefined>;
        const limits = effective
          ? CAPPED_ROLES.reduce(
              (acc, role) => {
                acc[role] = { used: usedByRole[role] ?? 0, max: effective[role] };
                return acc;
              },
              {} as Record<CappedRole, { used: number; max: number }>
            )
          : null;

        return {
          id: i.id,
          code: i.code,
          name: i.name,
          city: i.city,
          isActive: i.isActive,
          onboardingDone: i.onboardingDone,
          createdAt: i.createdAt,
          organization: i.organization,
          plan: i.plan ? { id: i.plan.id, code: i.plan.code, name: i.plan.name } : null,
          limits,
          customised: isCustomised(i),
          // Anyone at or over a cap can't add more of that role — the signal
          // that they've outgrown their tier.
          atLimit: limits ? Object.values(limits).some((l) => l.used >= l.max) : false,
          activeModules: i.modules.map((m) => m.module.code),
        };
      })
    );
  } catch (err) {
    next(err);
  }
});
