import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken, signResetToken, verifyResetToken, signMfaChallengeToken, verifyMfaChallengeToken } from "../lib/jwt.js";
import { ApiError } from "../lib/http.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { sendMail } from "../services/mailer.js";
import { otpEmailHtml } from "../lib/emailTemplates.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import {
  MFA_ELIGIBLE_ROLES,
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
  qrCodeDataUrl,
  generateBackupCodes,
} from "../lib/mfa.js";
import type { User } from "../generated/prisma/client.js";

export const authRouter = Router();

/** Burst guards on the unauthenticated surface. Deliberately loose enough
 * that a whole staff room behind one office NAT never trips them, tight
 * enough to make online password guessing and mail-flooding impractical.
 * The per-record limits (OTP attempt cap, resend cooldown) are the layer
 * that has to hold under a distributed attempt — see middleware/rateLimit.ts. */
const loginLimiter = rateLimit({ max: 20, windowMs: 5 * 60_000, keyPrefix: "auth-login" });
const forgotLimiter = rateLimit({ max: 5, windowMs: 15 * 60_000, keyPrefix: "auth-forgot" });
const otpLimiter = rateLimit({ max: 15, windowMs: 5 * 60_000, keyPrefix: "auth-verify-otp" });
const resetLimiter = rateLimit({ max: 10, windowMs: 15 * 60_000, keyPrefix: "auth-reset" });
// A 6-digit TOTP code has only a million combinations — far tighter than a
// password guess budget needs to be. Same shape as otpLimiter, its closest
// existing precedent for a short numeric code on an unauthenticated route.
const mfaVerifyLimiter = rateLimit({ max: 10, windowMs: 5 * 60_000, keyPrefix: "auth-mfa-verify" });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Shared by the non-MFA path in /login and the post-check path in
 * /mfa/verify — everything that happens once a login is genuinely approved,
 * whether that took one step or two. */
async function completeLogin(user: User) {
  let instituteId: string | null = null;
  let organizationId: string | null = null;

  if (user.role === "OWNER") {
    const org = await prisma.organization.findUnique({ where: { ownerId: user.id } });
    organizationId = org?.id ?? null;
    // OWNER always lands at the organization level; they enter a specific
    // institute afterwards via POST /auth/enter-institute.
  } else if (user.instituteId) {
    const institute = await prisma.institute.findUnique({ where: { id: user.instituteId } });
    instituteId = user.instituteId;
    organizationId = institute?.organizationId ?? null;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const token = signToken({ sub: user.id, role: user.role, instituteId, organizationId, tokenVersion: user.tokenVersion });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      instituteId,
      organizationId,
    },
    mustChangePassword: user.mustChangePassword,
  };
}

authRouter.post("/login", loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized("Invalid email or password");
    }

    // MFA gates new logins, not already-issued tokens — every existing
    // session for this user is unaffected either way. See changes-phase12.md
    // §12.6: the password check just passed, but a full session token isn't
    // issued yet, only a short-lived challenge that /mfa/verify exchanges
    // for the real thing once the second factor also checks out.
    if (user.mfaEnabledAt) {
      return res.json({ mfaRequired: true, challengeToken: signMfaChallengeToken(user.id) });
    }

    res.json(await completeLogin(user));
  } catch (err) {
    next(err);
  }
});

async function loadCurrentInstitute(instituteId: string | null) {
  if (!instituteId) return null;
  const institute = await prisma.institute.findUnique({
    where: { id: instituteId },
    include: {
      organization: true,
      plan: true,
      modules: { where: { isActive: true }, include: { module: true } },
    },
  });
  if (!institute) return null;

  return {
    id: institute.id,
    code: institute.code,
    name: institute.name,
    organizationName: institute.organization.name,
    planName: institute.plan?.name ?? null,
    biometricEnabled: institute.biometricEnabled,
    onboardingStep: institute.onboardingStep,
    onboardingDone: institute.onboardingDone,
    activeModules: institute.modules.map((m) => m.module.code),
  };
}

authRouter.get("/me", authenticate, async (req, res, next) => {
  try {
    const authUser = req.user!;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });

    const base = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phone: user.phone,
      mustChangePassword: user.mustChangePassword,
      termsAcceptedAt: user.termsAcceptedAt,
      mfaEligible: MFA_ELIGIBLE_ROLES.includes(user.role),
      mfaEnabled: !!user.mfaEnabledAt,
    };

    if (user.role === "SUPERADMIN") {
      return res.json({ ...base, organization: null, institutes: null, currentInstituteId: null, institute: null });
    }

    if (user.role === "OWNER") {
      const org = authUser.organizationId
        ? await prisma.organization.findUnique({
            where: { id: authUser.organizationId },
            include: { institutes: { include: { modules: { where: { isActive: true }, include: { module: true } } } } },
          })
        : null;

      const institute = await loadCurrentInstitute(authUser.instituteId);

      return res.json({
        ...base,
        organization: org
          ? { id: org.id, code: org.code, name: org.name, isActive: org.isActive }
          : null,
        institutes: org
          ? org.institutes.map((i) => ({
              id: i.id,
              code: i.code,
              name: i.name,
              isActive: i.isActive,
              onboardingDone: i.onboardingDone,
              activeModules: i.modules.map((m) => m.module.code),
            }))
          : [],
        currentInstituteId: authUser.instituteId,
        institute,
      });
    }

    // ADMIN / FACULTY / RECEPTION / STUDENT — always tied to one institute.
    const institute = await loadCurrentInstitute(authUser.instituteId);

    // Drives whether the portal shows a "Study material" nav item at all
    // (changes-phase12.md §12.5) — an empty section a student can tap into
    // and find nothing in is worse than no section. Only computed for
    // STUDENT: it's their own course's material, and no other role's nav
    // depends on it.
    let hasStudyResources = false;
    if (user.role === "STUDENT" && authUser.studentId) {
      const student = await prisma.student.findUnique({
        where: { id: authUser.studentId },
        select: { courseId: true },
      });
      if (student) {
        hasStudyResources = (await prisma.studyResource.count({ where: { courseId: student.courseId } })) > 0;
      }
    }

    res.json({
      ...base,
      organization: null,
      institutes: null,
      currentInstituteId: authUser.instituteId,
      institute,
      hasStudyResources,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/enter-institute", authenticate, requireRoles("OWNER"), async (req, res, next) => {
  try {
    const authUser = req.user!;
    const instituteId = typeof req.body?.instituteId === "string" ? req.body.instituteId : null;
    if (!instituteId) throw ApiError.badRequest("instituteId is required");
    if (!authUser.organizationId) throw ApiError.forbidden("No organization on this account");

    const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
    if (!institute || institute.organizationId !== authUser.organizationId) {
      throw ApiError.notFound("Institute not found in your organization");
    }
    // Suspension (platform.ts sets isActive:false) is the only way an institute
    // is ever taken out of service — there is no delete — so it has to actually
    // close the door here, not just hide the institute from listings.
    if (!institute.isActive) {
      throw ApiError.forbidden("This institute is suspended. Contact platform support.", "INSTITUTE_SUSPENDED");
    }

    const token = signToken({
      sub: authUser.id,
      role: "OWNER",
      instituteId: institute.id,
      organizationId: authUser.organizationId,
      sessionStart: authUser.sessionStart,
      tokenVersion: authUser.tokenVersion,
    });

    res.json({ token });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/exit-institute", authenticate, requireRoles("OWNER"), async (req, res, next) => {
  try {
    const authUser = req.user!;
    const token = signToken({
      sub: authUser.id,
      role: "OWNER",
      instituteId: null,
      organizationId: authUser.organizationId,
      sessionStart: authUser.sessionStart,
      tokenVersion: authUser.tokenVersion,
    });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

authRouter.post("/change-password", authenticate, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
    const authUser = req.user!;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });

    // First-login flow: the temp password was already verified at /auth/login
    // to obtain this session, so asking for it again is redundant. Voluntary
    // password changes (mustChangePassword already false) still require it.
    if (!user.mustChangePassword) {
      if (!currentPassword) throw ApiError.badRequest("Current password is required", "CURRENT_PASSWORD_REQUIRED");
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        throw ApiError.badRequest("Current password is incorrect", "INVALID_CURRENT_PASSWORD");
      }
    }

    const passwordHash = await hashPassword(newPassword);
    // A changed password is exactly the "my password may have leaked"
    // moment §12.2 exists for — bumping tokenVersion here signs every OTHER
    // session out immediately. The request making this call keeps working:
    // a fresh token (carrying the new version) goes out via the same silent
    // X-Refreshed-Token header authenticate() already uses for renewal, so
    // this session doesn't have to re-authenticate just because it changed
    // its own password.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
    });

    const refreshed = signToken({
      sub: authUser.id,
      role: authUser.role,
      instituteId: authUser.instituteId,
      organizationId: authUser.organizationId,
      sessionStart: authUser.sessionStart,
      tokenVersion: updated.tokenVersion,
    });
    res.setHeader("X-Refreshed-Token", refreshed);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/accept-terms", authenticate, async (req, res, next) => {
  try {
    const authUser = req.user!;
    await prisma.user.update({
      where: { id: authUser.id },
      data: { termsAcceptedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const GENERIC_FORGOT_MESSAGE = "If an account exists for that email, a 6-digit code has been sent.";
const OTP_RESEND_COOLDOWN_MS = 30_000;
const OTP_EXPIRES_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

const forgotPasswordSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-password", forgotLimiter, validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    const { email } = req.body as z.infer<typeof forgotPasswordSchema>;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Intentionally generic response either way — avoids user enumeration.
    if (!user || !user.isActive) {
      return res.json({ ok: true, message: GENERIC_FORGOT_MESSAGE });
    }

    const latest = await prisma.passwordResetOtp.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
      throw ApiError.badRequest("Please wait before requesting another code.", "OTP_COOLDOWN");
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await hashPassword(code);

    await prisma.$transaction([
      prisma.passwordResetOtp.deleteMany({ where: { userId: user.id, consumedAt: null } }),
      prisma.passwordResetOtp.create({
        data: { userId: user.id, codeHash, expiresAt: new Date(Date.now() + OTP_EXPIRES_MS) },
      }),
    ]);

    await sendMail({
      to: user.email,
      subject: "Your TutorGO password reset code",
      html: otpEmailHtml({ recipientName: user.fullName, code }),
      purpose: "PASSWORD_RESET_OTP",
      instituteId: user.instituteId,
    });

    res.json({ ok: true, message: GENERIC_FORGOT_MESSAGE });
  } catch (err) {
    next(err);
  }
});

const verifyOtpSchema = z.object({ email: z.string().email(), code: z.string().length(6) });

authRouter.post("/verify-otp", otpLimiter, validateBody(verifyOtpSchema), async (req, res, next) => {
  try {
    const { email, code } = req.body as z.infer<typeof verifyOtpSchema>;
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const invalid = () => ApiError.badRequest("That code is invalid or has expired.", "INVALID_OTP");
    if (!user || !user.isActive) throw invalid();

    const otp = await prisma.passwordResetOtp.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!otp) throw invalid();
    if (otp.attempts >= OTP_MAX_ATTEMPTS) throw invalid();

    const valid = await verifyPassword(code, otp.codeHash);
    if (!valid) {
      await prisma.passwordResetOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw invalid();
    }

    await prisma.passwordResetOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const resetToken = signResetToken(user.id);
    res.json({ resetToken });
  } catch (err) {
    next(err);
  }
});

const resetPasswordSchema = z
  .object({
    resetToken: z.string().min(1),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

authRouter.post("/reset-password", resetLimiter, validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    const { resetToken, newPassword } = req.body as z.infer<typeof resetPasswordSchema>;

    let userId: string;
    try {
      userId = verifyResetToken(resetToken).sub;
    } catch {
      throw ApiError.badRequest("This reset link is invalid or has expired.", "INVALID_RESET_TOKEN");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw ApiError.badRequest("This reset link is invalid or has expired.", "INVALID_RESET_TOKEN");

    const passwordHash = await hashPassword(newPassword);
    // Same reasoning as /auth/change-password: a reset password is exactly
    // the "leaked credential" case §12.2 exists for, so every session issued
    // before this reset dies. Unlike change-password there's no "current
    // session" to preserve here — the caller wasn't authenticated, they're
    // about to be signed in fresh below with the new version already baked in.
    const bumped = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
    });

    let instituteId: string | null = null;
    let organizationId: string | null = null;
    if (user.role === "OWNER") {
      const org = await prisma.organization.findUnique({ where: { ownerId: user.id } });
      organizationId = org?.id ?? null;
    } else if (user.instituteId) {
      const institute = await prisma.institute.findUnique({ where: { id: user.instituteId } });
      instituteId = user.instituteId;
      organizationId = institute?.organizationId ?? null;
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = signToken({ sub: user.id, role: user.role, instituteId, organizationId, tokenVersion: bumped.tokenVersion });

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, instituteId, organizationId },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Session revocation — see changes-phase12.md §12.2. Bumping tokenVersion is
// the entire mechanism: authenticate() rejects any token signed with the old
// value on its very next request. No token blocklist, no per-token rows.
// ---------------------------------------------------------------------------

authRouter.post("/logout-everywhere", authenticate, async (req, res, next) => {
  try {
    // Deliberately no new token here — the caller's own current session is
    // signed with the version about to be superseded, so it goes out with
    // everything else. The frontend's confirm dialog says so up front.
    await prisma.user.update({ where: { id: req.user!.id }, data: { tokenVersion: { increment: 1 } } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// MFA (TOTP) — see changes-phase12.md §12.6. Opt-in, expanded at build time
// to every staff role (OWNER/ADMIN/ACCOUNTANT/FACULTY/RECEPTION) rather than
// just OWNER/ADMIN as originally scoped — see lib/mfa.ts's MFA_ELIGIBLE_ROLES
// doc comment for why STUDENT/SUPERADMIN stay excluded.
// ---------------------------------------------------------------------------

function assertMfaEligible(role: string) {
  if (!MFA_ELIGIBLE_ROLES.includes(role as (typeof MFA_ELIGIBLE_ROLES)[number])) {
    throw ApiError.forbidden("Two-factor authentication isn't available for this account type");
  }
}

authRouter.post("/mfa/setup", authenticate, async (req, res, next) => {
  try {
    const authUser = req.user!;
    assertMfaEligible(authUser.role);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
    if (user.mfaEnabledAt) throw ApiError.badRequest("Two-factor authentication is already enabled — disable it first to reconfigure.");

    // Stored immediately but not enforced — mfaEnabledAt is what actually
    // gates login, so an abandoned setup (scanned but never confirmed) is
    // inert. Re-calling this endpoint before confirming just overwrites the
    // pending secret with a fresh one, which is exactly what "I messed up
    // the QR scan, let me try again" needs.
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: encrypt(secret) } });

    const uri = totpKeyUri(user.email, secret);
    const qrDataUrl = await qrCodeDataUrl(uri);

    res.json({ qrDataUrl, secret });
  } catch (err) {
    next(err);
  }
});

const mfaConfirmSchema = z.object({ code: z.string().trim().length(6, "Enter the 6-digit code") });

authRouter.post("/mfa/confirm", authenticate, validateBody(mfaConfirmSchema), async (req, res, next) => {
  try {
    const authUser = req.user!;
    assertMfaEligible(authUser.role);
    const { code } = req.body as z.infer<typeof mfaConfirmSchema>;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
    if (!user.mfaSecret) throw ApiError.badRequest("Start setup first with POST /auth/mfa/setup");
    if (user.mfaEnabledAt) throw ApiError.badRequest("Two-factor authentication is already enabled");

    if (!verifyTotpCode(decrypt(user.mfaSecret), code)) {
      throw ApiError.badRequest("That code is incorrect or has expired. Check your authenticator app and try again.", "INVALID_MFA_CODE");
    }

    // Shown exactly once — same principle as a just-generated temp password.
    // Hashed before storage; the plaintext list in this response is the only
    // place they ever exist outside the user's own record of them.
    const backupCodes = generateBackupCodes();
    const hashedCodes = await Promise.all(backupCodes.map((c) => hashPassword(c)));
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabledAt: new Date(), mfaBackupCodes: hashedCodes } });

    res.json({ backupCodes });
  } catch (err) {
    next(err);
  }
});

const mfaDisableSchema = z.object({ currentPassword: z.string().min(1) });

authRouter.post("/mfa/disable", authenticate, validateBody(mfaDisableSchema), async (req, res, next) => {
  try {
    const authUser = req.user!;
    const { currentPassword } = req.body as z.infer<typeof mfaDisableSchema>;

    const user = await prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
    // "Prove you're still you" before turning off a security feature — the
    // standard pattern for this, same reasoning as a voluntary password
    // change requiring the current one.
    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest("Current password is incorrect", "INVALID_CURRENT_PASSWORD");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: null, mfaEnabledAt: null, mfaBackupCodes: [] },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const mfaVerifySchema = z
  .object({
    challengeToken: z.string().min(1),
    code: z.string().trim().optional(),
    backupCode: z.string().trim().optional(),
  })
  .refine((v) => !!v.code || !!v.backupCode, { message: "Provide a code or a backup code" });

authRouter.post("/mfa/verify", mfaVerifyLimiter, validateBody(mfaVerifySchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof mfaVerifySchema>;

    let userId: string;
    try {
      userId = verifyMfaChallengeToken(body.challengeToken).sub;
    } catch {
      throw ApiError.badRequest("This login attempt has expired. Sign in again.", "MFA_CHALLENGE_EXPIRED");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !user.mfaEnabledAt || !user.mfaSecret) {
      throw ApiError.badRequest("This login attempt is no longer valid. Sign in again.", "MFA_CHALLENGE_EXPIRED");
    }

    let matched = false;
    if (body.code) {
      matched = verifyTotpCode(decrypt(user.mfaSecret), body.code);
    } else if (body.backupCode) {
      // No index to look a backup code up by — bcrypt hashes aren't
      // comparable except through bcrypt.compare, so this checks each
      // remaining one. There are at most 10, ever fewer as they're consumed,
      // so this is cheap; a matched code is removed from the array so it
      // can never be replayed.
      const normalized = body.backupCode.toUpperCase();
      for (const hash of user.mfaBackupCodes) {
        if (await verifyPassword(normalized, hash)) {
          matched = true;
          await prisma.user.update({
            where: { id: user.id },
            data: { mfaBackupCodes: user.mfaBackupCodes.filter((h) => h !== hash) },
          });
          break;
        }
      }
    }

    if (!matched) {
      throw ApiError.badRequest("That code is incorrect. Check your authenticator app, or use a backup code.", "INVALID_MFA_CODE");
    }

    res.json(await completeLogin(user));
  } catch (err) {
    next(err);
  }
});
