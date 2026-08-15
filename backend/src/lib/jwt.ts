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
  return jwt.verify(token, SECRET) as unknown as JwtPayload;
}
