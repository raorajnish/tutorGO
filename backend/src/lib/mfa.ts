import crypto from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import type { Role } from "../generated/prisma/enums.js";

/// Opt-in per changes-phase12.md §12.6, expanded at build time to every
/// staff role (not just OWNER/ADMIN as originally scoped) — STUDENT and
/// SUPERADMIN are deliberately excluded: the portal has its own simpler
/// access model, and SUPERADMIN is the account that has to stay reachable to
/// disable everyone else's MFA, so gating it behind MFA too raises the
/// platform's own lockout risk for no real benefit.
export const MFA_ELIGIBLE_ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"];

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "TutorGO", secret);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    return authenticator.check(code, secret);
  } catch {
    return false; // malformed code, not a real match — same as a wrong one
  }
}

export function qrCodeDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri);
}

const BACKUP_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — hand-copy friendly

function randomBackupCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += BACKUP_CODE_CHARS[crypto.randomInt(0, BACKUP_CODE_CHARS.length)];
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** 10 codes, shown once at confirm time — the caller hashes each before
 * persisting (same bcrypt helper as passwords), never the plaintext. */
export function generateBackupCodes(count = 10): string[] {
  return Array.from({ length: count }, randomBackupCode);
}
