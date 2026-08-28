import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/enums.js";

export interface JwtPayload {
  sub: string;
  role: Role;
  /// Set only while the caller is "inside" a specific institute (ADMIN/FACULTY/
  /// RECEPTION/STUDENT always; OWNER only after /auth/enter-institute).
  instituteId: string | null;
  /// Set for OWNER (their Organization) and, for convenience, for institute-tied
  /// roles (the Organization their Institute belongs to).
  organizationId: string | null;
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}

const SECRET: string = process.env.JWT_SECRET;

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyToken(token: string): JwtPayload {
  const payload = jwt.verify(token, SECRET) as Record<string, unknown>;
  // Reset tokens carry a `purpose` claim and must never authenticate a normal
  // session — only verifyResetToken() accepts them.
  if (payload.purpose) throw new jwt.JsonWebTokenError("Not a session token");
  return payload as unknown as JwtPayload;
}

export interface ResetTokenPayload {
  sub: string;
  purpose: "password_reset";
}

const RESET_TOKEN_EXPIRES_IN = "10m";

export function signResetToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "password_reset" } satisfies ResetTokenPayload, SECRET, {
    expiresIn: RESET_TOKEN_EXPIRES_IN,
  });
}

export function verifyResetToken(token: string): ResetTokenPayload {
  const payload = jwt.verify(token, SECRET) as Record<string, unknown>;
  if (payload.purpose !== "password_reset" || typeof payload.sub !== "string") {
    throw new jwt.JsonWebTokenError("Not a password-reset token");
  }
  return payload as unknown as ResetTokenPayload;
}
