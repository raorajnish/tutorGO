import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { signToken, signResetToken, verifyResetToken } from "../lib/jwt.js";
import { ApiError } from "../lib/http.js";
import { validateBody } from "../middleware/validate.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import { sendMail } from "../services/mailer.js";
import { otpEmailHtml } from "../lib/emailTemplates.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", validateBody(loginSchema), async (req, res, next) => {
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

    const token = signToken({ sub: user.id, role: user.role, instituteId, organizationId });

    res.json({
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
    });
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

    res.json({
      ...base,
      organization: null,
      institutes: null,
      currentInstituteId: authUser.instituteId,
      institute,
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

    const token = signToken({
      sub: authUser.id,
      role: "OWNER",
      instituteId: institute.id,
      organizationId: authUser.organizationId,
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
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    });

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

authRouter.post("/forgot-password", validateBody(forgotPasswordSchema), async (req, res, next) => {
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

authRouter.post("/verify-otp", validateBody(verifyOtpSchema), async (req, res, next) => {
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

authRouter.post("/reset-password", validateBody(resetPasswordSchema), async (req, res, next) => {
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
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
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
    const token = signToken({ sub: user.id, role: user.role, instituteId, organizationId });

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, instituteId, organizationId },
    });
  } catch (err) {
    next(err);
  }
});
