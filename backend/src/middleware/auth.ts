import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../lib/jwt.js";
import { ApiError } from "../lib/http.js";
import type { Role } from "../generated/prisma/enums.js";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  /// Set for ADMIN/FACULTY/RECEPTION/STUDENT always; set for OWNER only once
  /// they've "entered" a specific institute via /auth/enter-institute.
  instituteId: string | null;
  /// Set for OWNER (their Organization) and institute-tied roles (their
  /// institute's Organization).
  organizationId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantId?: string;
      organizationId?: string;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing bearer token");
    }

    const token = header.slice("Bearer ".length);
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw ApiError.unauthorized("Account is inactive or no longer exists");
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      // instituteId/organizationId are session-scoped (from the token), not the
      // User row — this is what lets an OWNER move between institutes in their
      // Organization without re-authenticating.
      instituteId: payload.instituteId,
      organizationId: payload.organizationId,
    };

    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden("You do not have permission to perform this action"));
    }
    next();
  };
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role !== "SUPERADMIN") {
    return next(ApiError.forbidden("Platform access only"));
  }
  next();
}

/** Ensures the caller is currently "inside" a specific institute, and stamps req.tenantId. */
export function requireInstitute(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.instituteId) {
    return next(
      ApiError.forbidden(
        req.user.role === "OWNER"
          ? "Enter an institute first (POST /auth/enter-institute)"
          : "This action requires an institute account"
      )
    );
  }
  req.tenantId = req.user.instituteId;
  next();
}

/** Ensures the caller (OWNER) is scoped to an Organization, and stamps req.organizationId. */
export function requireOrganization(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  if (!req.user.organizationId) {
    return next(ApiError.forbidden("This action requires an organization account"));
  }
  req.organizationId = req.user.organizationId;
  next();
}

/** Module gateway: blocks the route unless the caller's institute has an active subscription. */
export function requireModule(code: "ENQUIRY" | "ADMISSION" | "ATTENDANCE" | "FEES" | "PAYROLL" | "EXPENSE") {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.tenantId) throw ApiError.forbidden("This action requires an institute account");

      const subscription = await prisma.instituteModule.findFirst({
        where: {
          instituteId: req.tenantId,
          isActive: true,
          module: { code },
        },
      });

      if (!subscription) {
        throw new ApiError(403, "MODULE_DISABLED", `The ${code} module is not enabled for this institute`);
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
