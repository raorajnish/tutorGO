import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { authenticate, requireInstitute, requireRoles } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { auditLog } from "../services/audit.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { testConnection, syncTemplates, submitTemplate } from "../services/whatsapp.js";
import { WHATSAPP_TEMPLATE_SUGGESTIONS } from "../lib/whatsappTemplateSuggestions.js";
import { MESSAGE_TEMPLATE_TYPES, type MessageTemplateType } from "../lib/messageTemplates.js";

type WhatsAppConfigRow = Awaited<ReturnType<typeof prisma.instituteWhatsAppConfig.findUniqueOrThrow>>;

/** Settings → WhatsApp: credential setup, template sync/submit/map. Backend
 * groundwork only — no route here sends a message to a student; that's the
 * separate sendMessage() dispatcher follow-up. See changes-phase9.md §9a. */
export const whatsappRouter = Router();

whatsappRouter.use(authenticate, requireInstitute);

/** The one shape every config route returns — deliberately omits accessToken,
 * which no GET may ever expose. */
function serializeConfig(config: WhatsAppConfigRow) {
  return {
    phoneNumberId: config.phoneNumberId,
    wabaId: config.wabaId,
    businessAccountId: config.businessAccountId,
    isEnabled: config.isEnabled,
    connectedAt: config.connectedAt,
    updatedAt: config.updatedAt,
  };
}

whatsappRouter.get("/config", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const config = await prisma.instituteWhatsAppConfig.findUnique({ where: { instituteId: req.tenantId! } });
    if (!config) return res.json(null);

    res.json(serializeConfig(config));
  } catch (err) {
    next(err);
  }
});

const whatsappConfigSchema = z.object({
  accessToken: z.string().optional(),
  phoneNumberId: z.string().min(1, "Phone number ID is required"),
  wabaId: z.string().min(1, "WhatsApp Business Account ID is required"),
  businessAccountId: z.string().optional(),
  isEnabled: z.boolean(),
});

whatsappRouter.put("/config", requireRoles("OWNER", "ADMIN"), validateBody(whatsappConfigSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof whatsappConfigSchema>;
    const instituteId = req.tenantId!;

    const existing = await prisma.instituteWhatsAppConfig.findUnique({ where: { instituteId } });
    if (!body.accessToken && !existing) throw ApiError.badRequest("Access token is required for first-time setup");

    // Fail fast on bad creds — verify against the live Graph API before
    // ever persisting, same "test before save" spirit as email config,
    // just with a real remote check since the WhatsApp token is
    // higher-blast-radius than an SMTP password.
    const plainToken = body.accessToken ?? decrypt(existing!.accessToken);
    await testConnection({ accessToken: plainToken, phoneNumberId: body.phoneNumberId });

    const config = await prisma.instituteWhatsAppConfig.upsert({
      where: { instituteId },
      update: {
        phoneNumberId: body.phoneNumberId,
        wabaId: body.wabaId,
        businessAccountId: body.businessAccountId,
        isEnabled: body.isEnabled,
        ...(body.accessToken ? { accessToken: encrypt(body.accessToken) } : {}),
      },
      create: {
        instituteId,
        accessToken: encrypt(plainToken),
        phoneNumberId: body.phoneNumberId,
        wabaId: body.wabaId,
        businessAccountId: body.businessAccountId,
        isEnabled: body.isEnabled,
      },
    });

    await auditLog({
      action: "WHATSAPP_CONFIG_UPDATED",
      instituteId,
      userId: req.user!.id,
      metadata: { phoneNumberId: body.phoneNumberId, isEnabled: body.isEnabled },
    });

    res.json(serializeConfig(config));
  } catch (err) {
    next(err);
  }
});

whatsappRouter.post("/config/test", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const config = await prisma.instituteWhatsAppConfig.findUnique({ where: { instituteId } });
    if (!config) throw ApiError.badRequest("WhatsApp is not connected for this institute yet.");

    const result = await testConnection({ accessToken: decrypt(config.accessToken), phoneNumberId: config.phoneNumberId });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

const toggleSchema = z.object({ isEnabled: z.boolean() });

/** Flips the on/off switch without re-verifying against Meta — the
 * credentials were already verified at connect time (PUT /config above), so
 * a pure enable/disable flip should be instant, not another remote call. */
whatsappRouter.patch("/config/toggle", requireRoles("OWNER", "ADMIN"), validateBody(toggleSchema), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const body = req.body as z.infer<typeof toggleSchema>;

    const existing = await prisma.instituteWhatsAppConfig.findUnique({ where: { instituteId } });
    if (!existing) throw ApiError.badRequest("Connect WhatsApp before enabling it.");

    const config = await prisma.instituteWhatsAppConfig.update({ where: { instituteId }, data: { isEnabled: body.isEnabled } });

    await auditLog({
      action: body.isEnabled ? "WHATSAPP_ENABLED" : "WHATSAPP_DISABLED",
      instituteId,
      userId: req.user!.id,
    });

    res.json(serializeConfig(config));
  } catch (err) {
    next(err);
  }
});

whatsappRouter.delete("/config", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    await prisma.instituteWhatsAppConfig.deleteMany({ where: { instituteId } });
    await auditLog({ action: "WHATSAPP_CONFIG_DISCONNECTED", instituteId, userId: req.user!.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Templates — synced cache of Meta's WABA templates + locally-drafted
// suggestions the owner can submit for approval.
// ---------------------------------------------------------------------------

whatsappRouter.get("/templates", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const templates = await prisma.whatsAppTemplate.findMany({
      where: { instituteId: req.tenantId! },
      orderBy: { createdAt: "asc" },
    });
    res.json(templates);
  } catch (err) {
    next(err);
  }
});

/** (Re)creates a DRAFT row per internal trigger type that has no template
 * yet (synced or drafted) — idempotent, safe to call repeatedly as new
 * trigger types are added over time. */
whatsappRouter.post("/templates/suggest", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const instituteId = req.tenantId!;
    const existing = await prisma.whatsAppTemplate.findMany({
      where: { instituteId },
      select: { mappedType: true, name: true, language: true },
    });
    const covered = new Set(existing.map((t) => t.mappedType).filter(Boolean) as MessageTemplateType[]);
    // A template synced down from Meta occupies (name, language) with no
    // mappedType, so skipping on mappedType alone would still collide with
    // the unique index. Both guards, plus skipDuplicates as a backstop.
    const taken = new Set(existing.map((t) => `${t.name}:${t.language}`));

    const toCreate = MESSAGE_TEMPLATE_TYPES.map((type) => WHATSAPP_TEMPLATE_SUGGESTIONS[type]).filter(
      (s) => !covered.has(s.mappedType) && !taken.has(`${s.name}:${s.language}`)
    );
    if (toCreate.length > 0) {
      await prisma.whatsAppTemplate.createMany({
        skipDuplicates: true,
        data: toCreate.map((s) => ({
          instituteId,
          name: s.name,
          language: s.language,
          category: s.category,
          bodyText: s.bodyText,
          mappedType: s.mappedType,
          status: "DRAFT" as const,
        })),
      });
    }

    const templates = await prisma.whatsAppTemplate.findMany({ where: { instituteId }, orderBy: { createdAt: "asc" } });
    res.json(templates);
  } catch (err) {
    next(err);
  }
});

whatsappRouter.post("/templates/sync", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    const count = await syncTemplates(req.tenantId!);
    res.json({ synced: count });
  } catch (err) {
    next(err);
  }
});

whatsappRouter.post("/templates/:id/submit", requireRoles("OWNER", "ADMIN"), async (req, res, next) => {
  try {
    await submitTemplate(req.tenantId!, req.params.id as string);
    const template = await prisma.whatsAppTemplate.findUnique({ where: { id: req.params.id as string } });
    res.json(template);
  } catch (err) {
    next(err);
  }
});

const mapTemplateSchema = z.object({ mappedType: z.enum(MESSAGE_TEMPLATE_TYPES).nullable() });

whatsappRouter.post(
  "/templates/:id/map",
  requireRoles("OWNER", "ADMIN"),
  validateBody(mapTemplateSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof mapTemplateSchema>;
      const instituteId = req.tenantId!;
      const template = await prisma.whatsAppTemplate.findUnique({ where: { id: req.params.id as string } });
      if (!template || template.instituteId !== instituteId) throw ApiError.notFound("Template not found");

      const updated = await prisma.whatsAppTemplate.update({
        where: { id: template.id },
        data: { mappedType: body.mappedType },
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  }
);
