import { Router, type Request } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/http.js";
import { validateBody } from "../middleware/validate.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { auditLog } from "../services/audit.js";
import { loadReceiptByToken, serializeReceipt } from "../lib/receiptPayload.js";

/** Everything mounted here is intentionally unauthenticated — the one public
 * surface in the whole app (§8f). Kept in its own file rather than scattered
 * as unauthenticated exceptions inside students.ts/admission.ts, so "what's
 * public" stays auditable at a glance (the same reasoning already applied to
 * auth.ts's login/forgot-password routes). Every route here must:
 *   1. re-verify studentCode + PIN itself — never trust a client-held id
 *      across requests,
 *   2. return the same generic failure for "no such code", "wrong PIN", and
 *      "already completed" — a response that varies by reason turns the
 *      endpoint into an oracle for enumerating valid codes,
 *   3. sit behind rate limiting.
 * See changes-phase8.md §8f. */
export const publicRouter = Router();

const GENERIC_FAILURE = "That student ID and code don't match, or this profile can't be edited right now.";
const LOCKED_FAILURE = "This profile is locked after too many attempts — contact reception to unlock it.";
const MAX_ATTEMPTS = 5;

// Two independent limiters: a slightly looser one on lookup (a genuine
// student naturally retries a mistyped PIN a few times) and a tighter one on
// completion (should only ever be called once per real student per session).
const lookupLimiter = rateLimit({ max: 20, windowMs: 5 * 60_000, keyPrefix: "public-lookup" });
const completeLimiter = rateLimit({ max: 10, windowMs: 5 * 60_000, keyPrefix: "public-complete" });

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Loads the student and decides eligibility, but does NOT check the PIN —
 * callers do that themselves so `lookup` (read-only) and `complete-profile`
 * (mutating) can both re-run this from scratch on every request. Returns
 * null for every "can't proceed" case; the caller can't tell from this
 * return value alone *why*, which is the point. */
async function findEligibleStudent(studentCode: string) {
  const student = await prisma.student.findUnique({ where: { studentCode: normalizeCode(studentCode) } });
  if (!student) return null;
  if (!student.selfFillEligible) return null; // staff-admitted, never went through self-fill
  if (student.profileCompletedAt !== null) return null; // already submitted, and not reopened since
  return student;
}

/** Checks the PIN against an already-eligible student, applying and
 * persisting the lockout. Throws ApiError.badRequest with the locked or
 * generic message; returns nothing on success (caller proceeds). */
async function verifyPinOrThrow(student: { id: string; selfFillPin: string | null; selfFillAttempts: number; selfFillLockedAt: Date | null }, pin: string) {
  if (student.selfFillLockedAt !== null) throw ApiError.badRequest(LOCKED_FAILURE);

  if (student.selfFillPin !== pin) {
    const attempts = student.selfFillAttempts + 1;
    const lockingNow = attempts >= MAX_ATTEMPTS;
    await prisma.student.update({
      where: { id: student.id },
      data: { selfFillAttempts: attempts, selfFillLockedAt: lockingNow ? new Date() : undefined },
    });
    throw ApiError.badRequest(lockingNow ? LOCKED_FAILURE : GENERIC_FAILURE);
  }

  // Correct PIN — attempts reset so a later genuine retry (e.g. the student
  // comes back after staff reopened their profile) starts with a full budget.
  if (student.selfFillAttempts !== 0) {
    await prisma.student.update({ where: { id: student.id }, data: { selfFillAttempts: 0 } });
  }
}

const lookupSchema = z.object({
  studentCode: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "Enter the 4-digit code exactly as printed"),
});

publicRouter.post("/students/lookup", lookupLimiter, validateBody(lookupSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof lookupSchema>;

    const student = await findEligibleStudent(body.studentCode);
    if (!student) throw ApiError.badRequest(GENERIC_FAILURE);

    await verifyPinOrThrow(student, body.pin);

    const course = await prisma.course.findUnique({ where: { id: student.courseId }, select: { name: true, code: true } });

    res.json({
      id: student.id,
      name: student.name,
      course,
      // Pre-fill whatever's already on file (e.g. staff filled in a phone
      // number after the fact but before the student got to the form) so
      // the student isn't asked to re-enter something already captured.
      email: student.email.endsWith("@tutorgo.in") ? "" : student.email,
      phone: student.phone ?? "",
      parentPhone: student.parentPhone ?? "",
      dob: student.dob,
      fatherName: student.fatherName ?? "",
      motherName: student.motherName ?? "",
      school: student.school ?? "",
    });
  } catch (err) {
    next(err);
  }
});

const completeProfileSchema = z.object({
  studentCode: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  parentPhone: z.string().optional(),
  dob: z.coerce.date().optional(),
  fatherName: z.string().optional(),
  motherName: z.string().optional(),
  school: z.string().optional(),
});

publicRouter.post("/students/complete-profile", completeLimiter, validateBody(completeProfileSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof completeProfileSchema>;

    // Re-verified from scratch — this request may not be preceded by a
    // lookup call at all (a resume, a retry, a curious client hitting the
    // API directly), so nothing from an earlier request is trusted.
    const student = await findEligibleStudent(body.studentCode);
    if (!student) throw ApiError.badRequest(GENERIC_FAILURE);

    await verifyPinOrThrow(student, body.pin);

    if (body.email && body.email.toLowerCase() !== student.email) {
      const clash = await prisma.student.findUnique({ where: { email: body.email.toLowerCase() } });
      if (clash) throw ApiError.conflict("This email is already used by another student record — check for a typo.");
    }

    const updated = await prisma.student.update({
      where: { id: student.id },
      data: {
        email: body.email ? body.email.toLowerCase() : undefined,
        phone: body.phone,
        parentPhone: body.parentPhone,
        dob: body.dob,
        fatherName: body.fatherName,
        motherName: body.motherName,
        school: body.school,
        // Auto-completes on submit (confirmed with the user) — staff review
        // exceptions via the self-fill status view rather than approving
        // every single submission. Clearing the PIN here is what makes this
        // the point of no return for the public form: findEligibleStudent
        // will refuse this student on every subsequent call.
        profileCompletedAt: new Date(),
        selfFillPin: null,
        selfFillAttempts: 0,
        selfFillLockedAt: null,
      },
    });

    await auditLog({
      action: "STUDENT_SELF_FILL_COMPLETED",
      instituteId: updated.instituteId,
      targetType: "Student",
      targetId: updated.id,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// WhatsApp webhook — Meta calls this, not a browser. Groundwork only: this
// currently just verifies the handshake and logs delivery-status callbacks
// against OutboundMessage; no feature sends a message yet to generate them.
// See changes-phase9.md §9a and services/whatsapp.ts.
// ---------------------------------------------------------------------------

const webhookLimiter = rateLimit({ max: 120, windowMs: 60_000, keyPrefix: "whatsapp-webhook" });

/** Meta's one-time subscription handshake — GET with hub.mode=subscribe,
 * hub.verify_token, hub.challenge. Must echo hub.challenge back verbatim iff
 * the token matches WHATSAPP_WEBHOOK_VERIFY_TOKEN (app-level, see app.ts). */
publicRouter.get("/whatsapp/webhook", webhookLimiter, (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
});

function verifySignature(req: Request): boolean {
  const signature = req.headers["x-hub-signature-256"];
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (typeof signature !== "string" || !rawBody || !secret) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface WhatsAppStatusValue {
  statuses?: { id: string; status: string }[];
}

/** Delivery-status callbacks (sent/delivered/read/failed) for messages this
 * app sent — matched back to OutboundMessage via providerMessageId. Meta
 * expects a 200 quickly regardless of what's inside; a malformed or
 * unrecognized payload is logged and still acknowledged, not retried. */
publicRouter.post("/whatsapp/webhook", webhookLimiter, async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);
  res.sendStatus(200); // ack first — Meta retries aggressively on anything else

  try {
    const entries = (req.body?.entry ?? []) as { changes?: { value?: WhatsAppStatusValue }[] }[];
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        for (const status of change.value?.statuses ?? []) {
          // Only `failed` changes anything we store — sent/delivered/read
          // would be a DB round trip that writes nothing, at Meta's callback
          // volume. Revisit if OutboundMessage ever gains a deliveredAt.
          if (status.status !== "failed") continue;
          await prisma.outboundMessage.updateMany({
            where: { providerMessageId: status.id },
            data: { status: "FAILED", error: "Delivery failed (Meta callback)" },
          });
        }
      }
    }
  } catch {
    // Best-effort — the 200 is already sent; a malformed payload here must
    // never surface as a 5xx to Meta.
  }
});

// ---------------------------------------------------------------------------
// Public receipt links — no auth, the token itself is the auth (changes-
// phase10.md §10.3). Never expires; staff revoke a specific link on demand
// (POST /fees/payments/:id/receipt/revoke) rather than a blanket TTL — a
// receipt is a permanent proof-of-payment document by nature.
// ---------------------------------------------------------------------------

const receiptLimiter = rateLimit({ max: 30, windowMs: 5 * 60_000, keyPrefix: "public-receipt" });

publicRouter.get("/receipts/:token", receiptLimiter, async (req, res, next) => {
  try {
    const payment = await loadReceiptByToken(req.params.token as string);
    // Same 404 whether the token never existed or was revoked — a
    // distinguishing response would let someone probe which tokens are
    // merely wrong versus ones that once worked.
    if (!payment || payment.publicTokenRevokedAt) throw ApiError.notFound("This receipt link is no longer available.");

    res.json(serializeReceipt(payment));
  } catch (err) {
    next(err);
  }
});
