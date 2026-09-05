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
import { assertRoleCapacity, countUsage, type CappedRole } from "../services/planLimits.js";
import { CAPPED_ROLES, effectiveLimits } from "../lib/instituteLimits.js";
import { notify } from "../services/notify.js";
import { sendPush } from "../services/push.js";
import { DEFAULT_MESSAGE_TEMPLATES, MESSAGE_TEMPLATE_TYPES } from "../lib/messageTemplates.js";
import type { MessageTemplateType } from "../generated/prisma/enums.js";
import { daysBetween, todayDateOnly } from "../lib/dateOnly.js";
import multer from "multer";
import { parse as parseCsv } from "csv-parse/sync";
import { MAX_UPLOAD_BYTES, deleteAsset, uploadAsset } from "../services/uploads.js";
import { toCsv } from "../lib/csv.js";

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

// ---------------------------------------------------------------------------
// Bulk CSV import — see changes-phase12.md §12.1. Same validate-then-commit
// shape as /students/import: every row checked before any write, a full
// per-row report, re-uploading the same file skips already-created emails
// instead of duplicating them. No invite emails are sent for a bulk import —
// at import scale that's a lot of synchronous mail sends for one request, so
// each created row's temp password comes back in the report instead, same as
// the single-invite flow already does when email delivery isn't configured.
// ---------------------------------------------------------------------------

const TEAM_IMPORT_MAX_ROWS = 2000;
const TEAM_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
const teamImportUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TEAM_IMPORT_MAX_BYTES } });

const TEAM_IMPORT_COLUMNS = ["fullName", "email", "phone", "role"] as const;

const teamImportRowSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().pipe(z.string().email("Invalid email")),
  phone: z.string().trim().optional().default(""),
  role: z.string().trim().toUpperCase(),
});

interface TeamImportRowResult {
  line: number;
  status: "CREATED" | "SKIPPED" | "ERROR";
  name?: string;
  reason?: string;
  tempPassword?: string;
}

function parseTeamImportCsv(buffer: Buffer): Record<string, string>[] {
  let records: Record<string, string>[];
  try {
    records = parseCsv(buffer, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch {
    throw ApiError.badRequest("Could not parse this file — make sure it's a valid CSV with a header row.");
  }
  if (records.length === 0) throw ApiError.badRequest("This file has no data rows.");
  if (records.length > TEAM_IMPORT_MAX_ROWS) {
    throw ApiError.badRequest(
      `This file has ${records.length} rows — the limit per import is ${TEAM_IMPORT_MAX_ROWS}. Split it into smaller batches.`
    );
  }
  return records;
}

orgRouter.get("/team/import/template.csv", requireRoles("OWNER", "ADMIN"), (req, res) => {
  const csv = toCsv([[...TEAM_IMPORT_COLUMNS], ["Priya Sharma", "priya.sharma@example.com", "9876543210", "FACULTY"]]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="team-import-template.csv"');
  res.send(csv);
});

orgRouter.post(
  "/team/import",
  requireRoles("OWNER", "ADMIN"),
  teamImportUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) throw ApiError.badRequest("No file was uploaded.");
      const instituteId = req.tenantId!;
      const records = parseTeamImportCsv(req.file.buffer);

      const results: TeamImportRowResult[] = [];
      type PendingRow = { line: number; fullName: string; email: string; phone: string; role: TeamRole };
      const pending: PendingRow[] = [];

      for (let i = 0; i < records.length; i++) {
        const line = i + 2;
        const raw = records[i]!;
        const parsed = teamImportRowSchema.safeParse(raw);
        if (!parsed.success) {
          results.push({ line, status: "ERROR", name: raw.fullName, reason: parsed.error.issues[0]?.message ?? "Invalid row" });
          continue;
        }
        const row = parsed.data;
        if (!(TEAM_ROLES as readonly string[]).includes(row.role)) {
          results.push({ line, status: "ERROR", name: row.fullName, reason: `Role "${row.role}" must be one of: ${TEAM_ROLES.join(", ")}` });
          continue;
        }
        pending.push({ line, fullName: row.fullName, email: row.email, phone: row.phone, role: row.role as TeamRole });
      }

      // One batched existing-user lookup, plus in-file duplicate tracking —
      // same reasoning as the student importer: a re-upload of a partially
      // fixed file must skip already-created rows, not duplicate them.
      const emails = pending.map((p) => p.email);
      const existingEmails = emails.length
        ? new Set((await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })).map((u) => u.email.toLowerCase()))
        : new Set<string>();

      const seenInFile = new Set<string>();
      const toCreate: PendingRow[] = [];
      for (const p of pending) {
        if (existingEmails.has(p.email) || seenInFile.has(p.email)) {
          results.push({ line: p.line, status: "SKIPPED", name: p.fullName, reason: "A user with this email already exists" });
          continue;
        }
        seenInFile.add(p.email);
        toCreate.push(p);
      }

      // Preview mode — see students.ts's /import for why "would create" rows
      // are reported as CREATED here: nothing is written either way, and the
      // response's own dryRun flag is what tells the caller this is a preview.
      // Capacity isn't re-checked row-by-row in preview (that only matters at
      // actual creation time, sequentially, below), so a preview can show
      // more "would create" rows than the plan would ultimately allow through.
      if (req.body?.dryRun === "true") {
        for (const p of toCreate) {
          results.push({ line: p.line, status: "CREATED", name: p.fullName });
        }
        results.sort((a, b) => a.line - b.line);
        res.json({
          dryRun: true,
          created: toCreate.length,
          skipped: results.filter((r) => r.status === "SKIPPED").length,
          errors: results.filter((r) => r.status === "ERROR").length,
          rows: results,
        });
        return;
      }

      // Sequential, not Promise.all — assertRoleCapacity reads the current
      // headcount fresh each call, so rows for the same role must be created
      // one at a time for that check to see rows already created earlier in
      // this same import (otherwise a file with 10 FACULTY rows against a
      // limit of 5 could create all 10 before any of them "notice").
      const created: { line: number; fullName: string; email: string; tempPassword: string }[] = [];
      for (const p of toCreate) {
        try {
          await assertRoleCapacity(instituteId, p.role as CappedRole);
          const tempPassword = generateTempPassword();
          const passwordHash = await hashPassword(tempPassword);
          await prisma.user.create({
            data: {
              instituteId,
              email: p.email,
              passwordHash,
              fullName: p.fullName,
              phone: p.phone || undefined,
              role: p.role,
              mustChangePassword: true,
            },
          });
          created.push({ line: p.line, fullName: p.fullName, email: p.email, tempPassword });
        } catch (err) {
          results.push({
            line: p.line,
            status: "ERROR",
            name: p.fullName,
            reason: err instanceof ApiError ? err.message : "Could not create this team member",
          });
        }
      }

      for (const c of created) {
        results.push({ line: c.line, status: "CREATED", name: c.fullName, tempPassword: c.tempPassword });
      }
      results.sort((a, b) => a.line - b.line);

      if (created.length > 0) {
        await auditLog({
          action: "TEAM_MEMBERS_BULK_IMPORTED",
          organizationId: req.user!.organizationId,
          instituteId,
          userId: req.user!.id,
          targetType: "Institute",
          targetId: instituteId,
          metadata: { count: created.length, totalRows: records.length },
        });
      }

      res.status(201).json({
        dryRun: false,
        created: created.length,
        skipped: results.filter((r) => r.status === "SKIPPED").length,
        errors: results.filter((r) => r.status === "ERROR").length,
        rows: results,
      });
    } catch (err) {
      next(err);
    }
  }
);

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

    const [institute, used] = await Promise.all([
      prisma.institute.findUniqueOrThrow({ where: { id: instituteId }, include: { plan: true } }),
      countUsage(instituteId),
    ]);

    if (!institute.plan) {
      return res.json({ plan: null });
    }

    // Shows what's actually enforced for THIS institute — its own snapshot,
    // which may sit above the plan's headline numbers if the platform raised
    // it (lib/instituteLimits.ts). Showing the plan's numbers here would tell
    // an owner they're out of room when they aren't, and vice versa.
    const limits = effectiveLimits(institute)!;

    res.json({
      plan: {
        code: institute.plan.code,
        name: institute.plan.name,
        description: institute.plan.description,
        limits: CAPPED_ROLES.reduce(
          (acc, role) => {
            acc[role] = { used: used[role], max: limits[role] };
            return acc;
          },
          {} as Record<CappedRole, { used: number; max: number }>
        ),
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
// Self-serve payment collection (Settings → Payments) — changes-phase11.md
// §11.1. A student pays outside the app via UPI/QR and uploads proof of
// payment; staff review and approve it through /fees/payment-proofs, which
// records a real Payment through the same applyPayment() every other payment
// goes through. This section is only the institute's own config: whether the
// feature is on, and what UPI details/QR to show a student who opens it.
// ---------------------------------------------------------------------------

orgRouter.get("/payment-config", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const config = await prisma.institutePaymentConfig.findUnique({ where: { instituteId: req.tenantId! } });
    if (!config) return res.json(null);

    res.json({
      isEnabled: config.isEnabled,
      upiId: config.upiId,
      payeeName: config.payeeName,
      qrAssetUrl: config.qrAssetUrl,
      qrAssetName: config.qrAssetName,
      instructions: config.instructions,
      updatedAt: config.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

const paymentConfigSchema = z.object({
  isEnabled: z.boolean(),
  upiId: z.string().max(255).nullable().optional(),
  payeeName: z.string().max(120).nullable().optional(),
  instructions: z.string().max(500).nullable().optional(),
});

orgRouter.put(
  "/payment-config",
  requireRoles("OWNER", "ADMIN"),
  validateBody(paymentConfigSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof paymentConfigSchema>;
      const instituteId = req.tenantId!;

      const existing = await prisma.institutePaymentConfig.findUnique({ where: { instituteId } });

      // Enabling requires at least one way to actually pay — otherwise the
      // student portal would show a "Pay fees" button that opens an empty
      // sheet, which is worse than not showing the feature at all.
      if (body.isEnabled) {
        // `?? ` alone can't distinguish "the caller omitted upiId, keep the
        // existing value" from "the caller explicitly sent null to clear
        // it" — both are nullish. Checking `!== undefined` first (only true
        // when the key was actually present in the request body) is what
        // makes an explicit clear-and-enable in the same request correctly
        // fail this check instead of silently falling back to the old value.
        const upiValue = body.upiId !== undefined ? body.upiId : existing?.upiId;
        const hasUpi = Boolean(upiValue);
        const hasQr = Boolean(existing?.qrAssetUrl);
        if (!hasUpi && !hasQr) {
          throw ApiError.badRequest("Add a UPI ID or upload a QR code before enabling this for students.");
        }
      }

      const config = await prisma.institutePaymentConfig.upsert({
        where: { instituteId },
        update: body,
        create: { instituteId, ...body },
      });

      await auditLog({
        action: "INSTITUTE_PAYMENT_CONFIG_UPDATED",
        instituteId,
        organizationId: req.user!.organizationId,
        userId: req.user!.id,
        metadata: { isEnabled: config.isEnabled, hasUpi: Boolean(config.upiId), hasQr: Boolean(config.qrAssetUrl) },
      });

      res.json({
        isEnabled: config.isEnabled,
        upiId: config.upiId,
        payeeName: config.payeeName,
        qrAssetUrl: config.qrAssetUrl,
        qrAssetName: config.qrAssetName,
        instructions: config.instructions,
        updatedAt: config.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

const qrUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

orgRouter.post(
  "/payment-config/qr",
  requireRoles("OWNER", "ADMIN"),
  qrUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) throw ApiError.badRequest("No file was uploaded.");
      const instituteId = req.tenantId!;

      // A QR code is the institute's own public payment detail — the same
      // thing they'd print on a notice board — so it stays `public`, not
      // `authenticated` like a payment screenshot.
      const asset = await uploadAsset(req.file, { instituteId, folder: "payment-qr", visibility: "public" });

      const existing = await prisma.institutePaymentConfig.findUnique({ where: { instituteId } });
      // Replacing an existing QR deletes the old one rather than orphaning it
      // in storage — see services/uploads.ts.
      if (existing?.qrAssetPublicId) await deleteAsset(existing.qrAssetPublicId);

      const config = await prisma.institutePaymentConfig.upsert({
        where: { instituteId },
        update: { qrAssetUrl: asset.url, qrAssetName: asset.name, qrAssetPublicId: asset.publicId },
        create: {
          instituteId,
          qrAssetUrl: asset.url,
          qrAssetName: asset.name,
          qrAssetPublicId: asset.publicId,
        },
      });

      res.status(201).json({ qrAssetUrl: config.qrAssetUrl, qrAssetName: config.qrAssetName });
    } catch (err) {
      next(err);
    }
  }
);

orgRouter.delete("/payment-config/qr", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const existing = await prisma.institutePaymentConfig.findUnique({ where: { instituteId } });
    if (!existing?.qrAssetPublicId) return res.status(204).send();

    await deleteAsset(existing.qrAssetPublicId);
    await prisma.institutePaymentConfig.update({
      where: { instituteId },
      data: { qrAssetUrl: null, qrAssetName: null, qrAssetPublicId: null },
    });
    res.status(204).send();
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

// ---------------------------------------------------------------------------
// Staff leave (changes-phase10.md §10.4) — living on the Payroll page as
// "My leave" (everyone) and "Leave" (OWNER/ADMIN approve), but the model and
// routes sit here in org.ts since leave is not a payroll concept: an
// approved request has no automatic effect on pay in this phase.
// ---------------------------------------------------------------------------

/** Anyone who can be "on leave" in the HR sense — every institute-tied staff
 * role. Deliberately excludes STUDENT (not a staff-leave concept) and doesn't
 * need to include OWNER separately: an OWNER only has req.tenantId set while
 * "inside" an institute (see requireInstitute), and can request leave from
 * that institute like any other role if they ever want to log one. */
const LEAVE_ELIGIBLE_ROLES = ["OWNER", "ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"] as const;

function serializeLeaveRequest(row: {
  id: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  reason: string;
  status: string;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  user: { fullName: string; role: string };
  reviewedBy: { fullName: string } | null;
}) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.user.fullName,
    userRole: row.user.role,
    startDate: row.startDate,
    endDate: row.endDate,
    // Inclusive day count — a single-day request has startDate === endDate,
    // which is 1 day off, not 0.
    days: daysBetween(row.startDate, row.endDate) + 1,
    reason: row.reason,
    status: row.status,
    reviewedByName: row.reviewedBy?.fullName ?? null,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}

const leaveRequestInclude = {
  user: { select: { fullName: true, role: true } },
  reviewedBy: { select: { fullName: true } },
} as const;

const createLeaveSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().min(1, "A reason is required").max(500),
  })
  .refine((b) => b.endDate >= b.startDate, { message: "End date can't be before the start date", path: ["endDate"] });

orgRouter.post(
  "/leave",
  requireRoles(...LEAVE_ELIGIBLE_ROLES),
  validateBody(createLeaveSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createLeaveSchema>;
      const instituteId = req.tenantId!;

      if (daysBetween(todayDateOnly(), body.startDate) < 0) {
        throw ApiError.badRequest("Start date can't be in the past");
      }

      // Warn-not-block: staff can knowingly double-book (e.g. a planned
      // substitute already arranged) — flagged to the requester, decided for
      // real by whoever reviews it.
      const overlapping = await prisma.leaveRequest.findFirst({
        where: {
          instituteId,
          userId: req.user!.id,
          status: "APPROVED",
          startDate: { lte: body.endDate },
          endDate: { gte: body.startDate },
        },
      });

      const created = await prisma.leaveRequest.create({
        data: { instituteId, userId: req.user!.id, startDate: body.startDate, endDate: body.endDate, reason: body.reason },
        include: leaveRequestInclude,
      });

      res.status(201).json({
        ...serializeLeaveRequest(created),
        overlapsApprovedLeave: !!overlapping,
      });
    } catch (err) {
      next(err);
    }
  }
);

orgRouter.get("/leave/mine", requireRoles(...LEAVE_ELIGIBLE_ROLES), async (req, res, next) => {
  try {
    const rows = await prisma.leaveRequest.findMany({
      where: { instituteId: req.tenantId!, userId: req.user!.id },
      include: leaveRequestInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json(rows.map(serializeLeaveRequest));
  } catch (err) {
    next(err);
  }
});

/** Withdraw a request before it's reviewed — a staff member's own PENDING
 * request only. Never lets anyone touch a request that's already been
 * decided; that's what the Leave tab's Approve/Reject is for. */
orgRouter.post("/leave/:id/cancel", requireRoles(...LEAVE_ELIGIBLE_ROLES), async (req, res, next) => {
  try {
    const row = await prisma.leaveRequest.findUnique({ where: { id: req.params.id as string } });
    if (!row || row.instituteId !== req.tenantId) throw ApiError.notFound("Leave request not found");
    if (row.userId !== req.user!.id) throw ApiError.forbidden("You can only cancel your own request");
    if (row.status !== "PENDING") throw ApiError.badRequest("Only a pending request can be withdrawn");

    const updated = await prisma.leaveRequest.update({
      where: { id: row.id },
      data: { status: "CANCELLED" },
      include: leaveRequestInclude,
    });
    res.json(serializeLeaveRequest(updated));
  } catch (err) {
    next(err);
  }
});

orgRouter.get("/leave", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await prisma.leaveRequest.findMany({
      where: { instituteId: req.tenantId!, ...(status ? { status: status as never } : {}) },
      include: leaveRequestInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json(rows.map(serializeLeaveRequest));
  } catch (err) {
    next(err);
  }
});

const reviewLeaveSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().max(500).optional(),
});

orgRouter.patch(
  "/leave/:id",
  requireRoles("OWNER", "ADMIN"),
  validateBody(reviewLeaveSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof reviewLeaveSchema>;
      const row = await prisma.leaveRequest.findUnique({ where: { id: req.params.id as string } });
      if (!row || row.instituteId !== req.tenantId) throw ApiError.notFound("Leave request not found");
      if (row.status !== "PENDING") throw ApiError.badRequest("This request has already been reviewed");

      const updated = await prisma.leaveRequest.update({
        where: { id: row.id },
        data: {
          status: body.status,
          reviewedByUserId: req.user!.id,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote,
        },
        include: leaveRequestInclude,
      });

      await auditLog({
        action: body.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
        organizationId: req.user!.organizationId,
        instituteId: req.tenantId!,
        userId: req.user!.id,
        targetType: "LeaveRequest",
        targetId: row.id,
        metadata: { requestedBy: row.userId },
      });

      const notifyTitle = body.status === "APPROVED" ? "Leave request approved" : "Leave request rejected";
      const notifyBody = body.reviewNote ?? `Your leave request was ${body.status === "APPROVED" ? "approved" : "rejected"}.`;
      await notify({
        instituteId: req.tenantId!,
        userId: row.userId,
        type: "LEAVE_REVIEWED",
        title: notifyTitle,
        body: notifyBody,
        metadata: { leaveRequestId: row.id, status: body.status },
      }).catch(() => {});
      await sendPush({ userId: row.userId, title: notifyTitle, body: notifyBody }).catch(() => {});

      res.json(serializeLeaveRequest(updated));
    } catch (err) {
      next(err);
    }
  }
);
