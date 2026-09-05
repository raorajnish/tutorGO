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
  /// Epoch ms of the ORIGINAL login — stamped once and copied unchanged
  /// through every silent renewal (see middleware/auth.ts). This is what
  /// makes the sliding-expiry scheme in authenticate() a real session length
  /// rather than a token that quietly renews itself forever: renewal is
  /// refused once `now - sessionStart` passes SESSION_ABSOLUTE_CAP_MS,
  /// however recently the token itself was issued.
  sessionStart: number;
  /// The User.tokenVersion live at sign time (changes-phase12.md §12.2).
  /// authenticate() rejects a token whose value no longer matches the
  /// column — the entire "log out everywhere" mechanism is this one
  /// comparison. Every signToken() call must pass the CURRENT column value
  /// through explicitly; there's no safe default the way sessionStart has
  /// one, since defaulting here would silently mint a token that can never
  /// be revoked by a version bump.
  tokenVersion: number;
  /// Set automatically by jsonwebtoken on every sign() call (seconds since
  /// epoch) — read back by authenticate() to decide "is this token old enough
  /// within its own 7-day life to be worth silently renewing yet?".
  iat?: number;
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

/// Numeric twin of EXPIRES_IN, used only for the renewal heuristic below
/// (jsonwebtoken's `expiresIn` accepts a free-form string like "7d" that
/// isn't cheap to parse back out of a decoded token). If JWT_EXPIRES_IN is
/// ever changed away from its default, this constant should move with it —
/// a drift here only affects *when* a silent renewal happens, never whether
/// an actually-expired token is honoured, so it fails safe either way.
const ACCESS_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/// Sliding-expiry hard ceiling (changes-phase11.md §11.3): whatever happens,
/// a session that started more than this long ago stops renewing and the
/// user re-authenticates once their current token's own (short) expiry
/// catches up. One number for every role — settled with the user rather than
/// a per-role split, to keep "why was I signed out" simple to explain.
export const SESSION_ABSOLUTE_CAP_MS = Number(process.env.SESSION_ABSOLUTE_CAP_DAYS ?? 14) * 24 * 60 * 60 * 1000;
/// Renewal only kicks in once a token is more than halfway to its own
/// expiry — issuing a fresh one on literally every request would mean every
/// response carries a new token for no benefit, since the old one is still
/// perfectly valid for days yet.
export const RENEW_AFTER_MS = ACCESS_TOKEN_TTL_MS / 2;

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set");
}

const SECRET: string = process.env.JWT_SECRET;

/// `sessionStart` defaults to "now" when omitted — the normal case for an
/// actual login. Callers renewing an existing session (authenticate()'s
/// silent refresh, /auth/enter-institute, /auth/exit-institute) pass the
/// original value through explicitly so the absolute cap keeps counting from
/// the real start, not from every renewal.
export function signToken(payload: Omit<JwtPayload, "sessionStart" | "iat"> & { sessionStart?: number }): string {
  const { sessionStart, ...rest } = payload;
  return jwt.sign(
    { ...rest, sessionStart: sessionStart ?? Date.now() },
    SECRET,
    { expiresIn: EXPIRES_IN as jwt.SignOptions["expiresIn"] }
  );
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

/// changes-phase12.md §12.6 — issued by POST /auth/login in place of a real
/// session token when the account has MFA enabled. Deliberately short-lived
/// and single-purpose: it proves "this password check just passed," nothing
/// more, and POST /auth/mfa/verify is the only thing that accepts it.
export interface MfaChallengePayload {
  sub: string;
  purpose: "mfa_challenge";
}

const MFA_CHALLENGE_EXPIRES_IN = "5m";

export function signMfaChallengeToken(userId: string): string {
  return jwt.sign({ sub: userId, purpose: "mfa_challenge" } satisfies MfaChallengePayload, SECRET, {
    expiresIn: MFA_CHALLENGE_EXPIRES_IN,
  });
}

export function verifyMfaChallengeToken(token: string): MfaChallengePayload {
  const payload = jwt.verify(token, SECRET) as Record<string, unknown>;
  if (payload.purpose !== "mfa_challenge" || typeof payload.sub !== "string") {
    throw new jwt.JsonWebTokenError("Not an MFA challenge token");
  }
  return payload as unknown as MfaChallengePayload;
}
