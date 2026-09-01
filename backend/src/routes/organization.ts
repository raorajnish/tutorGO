import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireOrganization, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";

export const organizationRouter = Router();

organizationRouter.use(authenticate, requireRoles("OWNER"), requireOrganization);

// ---------------------------------------------------------------------------
// Institutes (branches) under this organization
// ---------------------------------------------------------------------------

export const instituteCodeSchema = z
  .string()
  .min(2, "Institute code must be 2-8 characters")
  .max(8, "Institute code must be 2-8 characters")
  .regex(/^[A-Za-z0-9-]+$/, "Institute code must be alphanumeric (dashes allowed)");

const createInstituteSchema = z.object({
  name: z.string().min(1, "Institute name is required"),
  code: instituteCodeSchema,
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  planCode: z.string().optional(),
  modules: z.array(z.enum(["ENQUIRY", "ADMISSION", "ATTENDANCE", "FEES", "PAYROLL", "EXPENSE"])).default([]),
});

organizationRouter.post("/institutes", validateBody(createInstituteSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createInstituteSchema>;
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
          organizationId: req.organizationId!,
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
        data: allModules.map((m) => ({
          instituteId: created.id,
          moduleId: m.id,
          isActive: selected.has(m.code),
        })),
      });

      return created;
    });

    await auditLog({
      action: "INSTITUTE_CREATED",
      organizationId: req.organizationId!,
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

async function loadOwnedInstitute(organizationId: string, instituteId: string) {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
  if (!institute || institute.organizationId !== organizationId) {
    throw ApiError.notFound("Institute not found in your organization");
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

organizationRouter.get("/institutes/:id", async (req, res, next) => {
  try {
    const institute = await loadOwnedInstitute(req.organizationId!, req.params.id);

    const [modules, admins, accountants, plan, roleCounts] = await Promise.all([
      prisma.instituteModule.findMany({ where: { instituteId: institute.id }, include: { module: true } }),
      prisma.user.findMany({
        where: { instituteId: institute.id, role: "ADMIN" },
        select: STAFF_SELECT,
        orderBy: { createdAt: "asc" },
      }),
      prisma.user.findMany({
        where: { instituteId: institute.id, role: "ACCOUNTANT" },
        select: STAFF_SELECT,
        orderBy: { createdAt: "asc" },
      }),
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
      plan: plan
        ? {
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

const toggleModuleSchema = z.object({
  moduleCode: z.enum(["ENQUIRY", "ADMISSION", "ATTENDANCE", "FEES", "PAYROLL", "EXPENSE"]),
  isActive: z.boolean(),
});

organizationRouter.post(
  "/institutes/:id/toggle-module",
  validateBody(toggleModuleSchema),
  async (req, res, next) => {
    try {
      const institute = await loadOwnedInstitute(req.organizationId!, req.params.id as string);
      const { moduleCode, isActive } = req.body as z.infer<typeof toggleModuleSchema>;

      const moduleRow = await prisma.module.findUnique({ where: { code: moduleCode } });
      if (!moduleRow) throw ApiError.notFound("Module not found");

      const updated = await prisma.instituteModule.upsert({
        where: { instituteId_moduleId: { instituteId: institute.id, moduleId: moduleRow.id } },
        update: { isActive },
        create: { instituteId: institute.id, moduleId: moduleRow.id, isActive },
      });

      await auditLog({
        action: "MODULE_TOGGLED",
        organizationId: req.organizationId!,
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

