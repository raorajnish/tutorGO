import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/http.js";

/** Per-IP sliding-window limiter, in-memory. Generic on purpose — nothing in
 * this app has ever needed rate limiting before the public admission-form
 * surface (§8f). Now also covers /auth/login, /auth/forgot-password and
 * /auth/verify-otp (routes/auth.ts).
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
  // `req.ip` only, never the raw X-Forwarded-For header. Express resolves it
  // against the `trust proxy` hop count set in app.ts, so a forged XFF from
  // an untrusted client is ignored. Reading the header directly would let
  // anyone mint a fresh bucket per request and bypass every limiter here.
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
