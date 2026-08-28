import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/http.js";

/** Per-IP sliding-window limiter, in-memory. Generic on purpose — nothing in
 * this app has ever needed rate limiting before the public admission-form
 * surface (§8f), but this is written to also cover /auth/login and the OTP
 * routes whenever that gets picked up (both are currently unprotected —
 * flagged in changes-phase8.md §8f, not fixed in this pass).
 *
 * Honest limitation: in-memory means per-process. Running more than one
 * instance (Render can) roughly multiplies the effective allowance by the
 * instance count. Acceptable for a burst guard — the layer that actually has
 * to hold under a distributed attempt is the per-record DB-backed lockout
 * (see routes/public.ts), not this. */

interface Bucket {
  count: number;
  windowStartedAt: number;
}

const buckets = new Map<string, Bucket>();

// Bounded cleanup so a long-running process doesn't accumulate one entry per
// IP forever — sweeps stale buckets every 10 minutes rather than tracking a
// timer per key.
const SWEEP_INTERVAL_MS = 10 * 60_000;
let lastSweep = Date.now();
function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStartedAt > windowMs) buckets.delete(key);
  }
}

function clientIp(req: Request): string {
  // Trusts X-Forwarded-For's first hop — fine behind a single reverse proxy
  // (Render, most VPS nginx setups); would need `app.set("trust proxy", ...)`
  // plus a real proxy-chain policy if that assumption ever stops holding.
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export interface RateLimitOptions {
  /** Requests allowed per window. */
  max: number;
  windowMs: number;
  /** Distinguishes buckets sharing the same in-memory Map — otherwise a tight
   * limiter on one route would also throttle an unrelated one. */
  keyPrefix: string;
}

export function rateLimit({ max, windowMs, keyPrefix }: RateLimitOptions) {
  return (req: Request, _res: Response, next: NextFunction) => {
    sweep(windowMs);

    const key = `${keyPrefix}:${clientIp(req)}`;
    const now = Date.now();
    const existing = buckets.get(key);

    if (!existing || now - existing.windowStartedAt > windowMs) {
      buckets.set(key, { count: 1, windowStartedAt: now });
      return next();
    }

    if (existing.count >= max) {
      return next(ApiError.tooManyRequests());
    }

    existing.count++;
    next();
  };
}

/** For tests only — the module-level Map otherwise leaks state between test
 * cases that share a process. */
export function __resetRateLimitsForTests(): void {
  buckets.clear();
}
