import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { decrypt } from "../lib/crypto.js";
import { WHATSAPP_TEMPLATE_SUGGESTIONS } from "../lib/whatsappTemplateSuggestions.js";
import type { WhatsAppTemplateStatus } from "../generated/prisma/enums.js";

/** Thin Meta WhatsApp Business Cloud API client. Nothing here queues or
 * dispatches on a schedule — every function is a direct Graph API call for
 * the institute's own connected WABA. The eventual sendMessage() dispatcher
 * (fee-overdue, 8f links, 9b alerts) is a separate follow-up that will call
 * sendTemplateMessage() below — this file is groundwork only, see
 * changes-phase9.md §9a. */

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number };
}

async function graphRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as GraphErrorBody & Record<string, unknown>;
  if (!res.ok) {
    throw ApiError.badRequest(body.error?.message ?? `WhatsApp API request failed (${res.status})`, "WHATSAPP_API_ERROR");
  }
  return body as T;
}

/** Loads and decrypts an institute's saved config — throws if never
 * connected, since every caller here only runs after a successful setup.
 * `requireEnabled` is the single chokepoint for the Settings on/off switch:
 * anything that actually messages a student passes it, so the kill switch
 * can't be missed by a future caller. Template admin (sync/submit) is
 * deliberately allowed while switched off — that's setup work, not sending. */
async function loadConfig(instituteId: string, requireEnabled = false) {
  const config = await prisma.instituteWhatsAppConfig.findUnique({ where: { instituteId } });
  if (!config) throw ApiError.badRequest("WhatsApp is not connected for this institute yet.");
  if (requireEnabled && !config.isEnabled) {
    throw ApiError.badRequest("WhatsApp messaging is switched off for this institute.", "WHATSAPP_DISABLED");
  }
  return { ...config, accessToken: decrypt(config.accessToken) };
}

/** Verifies phoneNumberId + accessToken actually work together before we
 * ever save them — same "fail fast on bad creds" pattern as any other
 * integration setup, just done against a live Graph API call. */
export async function testConnection(params: { accessToken: string; phoneNumberId: string }): Promise<{ displayPhoneNumber: string; verifiedName: string }> {
  const data = await graphRequest<{ display_phone_number: string; verified_name: string }>(
    `/${params.phoneNumberId}?fields=display_phone_number,verified_name`,
    params.accessToken
  );
  return { displayPhoneNumber: data.display_phone_number, verifiedName: data.verified_name };
}

interface MetaTemplateComponent {
  type: string;
  text?: string;
}

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: MetaTemplateComponent[];
}

function bodyTextOf(components: MetaTemplateComponent[]): string {
  return components.find((c) => c.type === "BODY")?.text ?? "";
}

/** Meta's status vocabulary is wider than ours (PAUSED, DISABLED, IN_APPEAL,
 * PENDING_DELETION, ...). Folding the unknowns onto a local equivalent keeps
 * one odd template from throwing mid-loop and aborting the whole sync. */
function localStatus(metaStatus: string): WhatsAppTemplateStatus {
  switch (metaStatus?.toUpperCase()) {
    case "APPROVED":
      return "APPROVED";
    case "REJECTED":
    case "DISABLED":
    case "PAUSED":
      return "REJECTED";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
      return "PENDING";
    default:
      return "PENDING";
  }
}

/** Meta requires an `example` for any template containing {{n}} placeholders
 * — a submission without one is rejected outright. Sample values come from
 * our own suggestion catalogue (matched on name), since a synced-down or
 * hand-made row has none of its own. */
function bodyComponent(name: string, bodyText: string) {
  const placeholderCount = new Set(bodyText.match(/\{\{\d+\}\}/g) ?? []).size;
  if (placeholderCount === 0) return { type: "BODY", text: bodyText };

  const suggestion = Object.values(WHATSAPP_TEMPLATE_SUGGESTIONS).find((s) => s.name === name);
  const samples = Array.from({ length: placeholderCount }, (_, i) => suggestion?.sampleValues[i] ?? `Sample ${i + 1}`);
  return { type: "BODY", text: bodyText, example: { body_text: [samples] } };
}

/** Pulls the institute's current WABA templates and upserts them into the
 * local cache (WhatsAppTemplate), preserving any mappedType a staff member
 * already set — a re-sync must never silently unmap a trigger. */
export async function syncTemplates(instituteId: string): Promise<number> {
  const config = await loadConfig(instituteId);
  const data = await graphRequest<{ data: MetaTemplate[] }>(
    `/${config.wabaId}/message_templates?fields=id,name,language,category,status,components&limit=100`,
    config.accessToken
  );

  for (const t of data.data) {
    await prisma.whatsAppTemplate.upsert({
      where: { instituteId_name_language: { instituteId, name: t.name, language: t.language } },
      update: {
        metaTemplateId: t.id,
        category: t.category,
        status: localStatus(t.status),
        bodyText: bodyTextOf(t.components),
        lastSyncedAt: new Date(),
      },
      create: {
        instituteId,
        metaTemplateId: t.id,
        name: t.name,
        language: t.language,
        category: t.category,
        status: localStatus(t.status),
        bodyText: bodyTextOf(t.components),
        lastSyncedAt: new Date(),
      },
    });
  }

  return data.data.length;
}

/** Submits a locally-drafted template to Meta for review. Only valid for a
 * DRAFT row (metaTemplateId null) — an already-submitted template must be
 * edited on Meta's side, not resubmitted from here. */
export async function submitTemplate(instituteId: string, templateId: string): Promise<void> {
  const config = await loadConfig(instituteId);
  const template = await prisma.whatsAppTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.instituteId !== instituteId) throw ApiError.notFound("Template not found");
  if (template.metaTemplateId) throw ApiError.badRequest("This template was already submitted to Meta.");

  const data = await graphRequest<{ id: string; status: string }>(`/${config.wabaId}/message_templates`, config.accessToken, {
    method: "POST",
    body: JSON.stringify({
      name: template.name,
      language: template.language,
      category: template.category,
      components: [bodyComponent(template.name, template.bodyText)],
    }),
  });

  await prisma.whatsAppTemplate.update({
    where: { id: templateId },
    data: { metaTemplateId: data.id, status: localStatus(data.status), lastSyncedAt: new Date() },
  });
}

/** Sends one approved-template message and logs it to OutboundMessage
 * regardless of outcome — a failure here must be visible to staff, not
 * silently swallowed. Not yet called by any feature; wired in once the
 * unifying sendMessage() dispatcher lands (see changes-phase9.md §9a). */
export async function sendTemplateMessage(params: {
  instituteId: string;
  studentId?: string;
  toPhone: string;
  templateName: string;
  language: string;
  bodyParams?: string[];
}): Promise<{ status: "SENT" | "FAILED"; providerMessageId?: string; error?: string }> {
  const { instituteId, studentId, toPhone, templateName, language, bodyParams = [] } = params;

  const log = await prisma.outboundMessage.create({
    data: { instituteId, studentId, toPhone, templateName, payload: { language, bodyParams }, status: "QUEUED" },
  });

  try {
    const config = await loadConfig(instituteId, true);
    const data = await graphRequest<{ messages: { id: string }[] }>(`/${config.phoneNumberId}/messages`, config.accessToken, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: bodyParams.length > 0 ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] : undefined,
        },
      }),
    });

    const providerMessageId = data.messages[0]?.id;
    await prisma.outboundMessage.update({ where: { id: log.id }, data: { status: "SENT", providerMessageId, sentAt: new Date() } });
    return { status: "SENT", providerMessageId };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    await prisma.outboundMessage.update({ where: { id: log.id }, data: { status: "FAILED", error } });
    return { status: "FAILED", error };
  }
}
