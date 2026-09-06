import { prisma } from "./prisma.js";
import type { MaintenanceScope } from "../generated/prisma/enums.js";

export type MaintenanceStatus = "upcoming" | "active" | "ended" | "cancelled";

export interface MaintenanceWindowInfo {
  id: string;
  scope: MaintenanceScope;
  instituteId: string | null;
  startAt: Date;
  endAt: Date;
  message: string | null;
  status: MaintenanceStatus;
}

/// Pure derivation — status is never stored (see schema.prisma's
/// MaintenanceWindow doc), only computed from these three timestamps.
export function deriveStatus(
  startAt: Date,
  endAt: Date,
  cancelledAt: Date | null,
  now: Date
): MaintenanceStatus {
  if (cancelledAt) return "cancelled";
  if (now < startAt) return "upcoming";
  if (now <= endAt) return "active";
  return "ended";
}

const CACHE_TTL_MS = 15_000;

// authenticate() calls this on effectively every authenticated request, so a
// DB round trip per request is not acceptable. Live (non-cancelled, not yet
// ended) windows are rare and change only via the platform maintenance
// routes, so an in-process cache with a short TTL — invalidated immediately
// on write — keeps the common case to zero DB cost without ever serving
// stale data for more than CACHE_TTL_MS after a schedule/cancel action.
let globalCache: { value: MaintenanceWindowInfo | null; expiresAt: number } | null = null;
const instituteCache = new Map<string, { value: MaintenanceWindowInfo | null; expiresAt: number }>();

function toInfo(
  row: { id: string; scope: MaintenanceScope; instituteId: string | null; startAt: Date; endAt: Date; message: string | null; cancelledAt: Date | null },
  now: Date
): MaintenanceWindowInfo {
  return {
    id: row.id,
    scope: row.scope,
    instituteId: row.instituteId,
    startAt: row.startAt,
    endAt: row.endAt,
    message: row.message,
    status: deriveStatus(row.startAt, row.endAt, row.cancelledAt, now),
  };
}

async function loadGlobalWindow(now: Date): Promise<MaintenanceWindowInfo | null> {
  const row = await prisma.maintenanceWindow.findFirst({
    where: { scope: "GLOBAL", cancelledAt: null, endAt: { gt: now } },
    orderBy: { startAt: "asc" },
  });
  return row ? toInfo(row, now) : null;
}

async function loadInstituteWindow(instituteId: string, now: Date): Promise<MaintenanceWindowInfo | null> {
  const row = await prisma.maintenanceWindow.findFirst({
    where: { scope: "INSTITUTE", instituteId, cancelledAt: null, endAt: { gt: now } },
    orderBy: { startAt: "asc" },
  });
  return row ? toInfo(row, now) : null;
}

async function getGlobalWindow(now: Date): Promise<MaintenanceWindowInfo | null> {
  if (globalCache && globalCache.expiresAt > now.getTime()) return globalCache.value;
  const value = await loadGlobalWindow(now);
  globalCache = { value, expiresAt: now.getTime() + CACHE_TTL_MS };
  return value;
}

async function getInstituteWindow(instituteId: string, now: Date): Promise<MaintenanceWindowInfo | null> {
  const cached = instituteCache.get(instituteId);
  if (cached && cached.expiresAt > now.getTime()) return cached.value;
  const value = await loadInstituteWindow(instituteId, now);
  instituteCache.set(instituteId, { value, expiresAt: now.getTime() + CACHE_TTL_MS });
  return value;
}

/// Clears the cache immediately — called by the platform maintenance routes
/// right after any create/cancel/update, so a schedule change is visible on
/// the very next request instead of waiting out the TTL.
export function invalidateMaintenanceCache() {
  globalCache = null;
  instituteCache.clear();
}

/// The window that should currently block access for a user bound to
/// `instituteId` (null for SUPERADMIN/un-entered OWNER — only a GLOBAL window
/// can affect them). Returns null unless a window is genuinely `active` right
/// now. Cheap: at most two cached lookups, each backed by an indexed query.
export async function getBlockingWindow(
  instituteId: string | null,
  now: Date = new Date()
): Promise<MaintenanceWindowInfo | null> {
  const global = await getGlobalWindow(now);
  if (global?.status === "active") return global;
  if (instituteId) {
    const institute = await getInstituteWindow(instituteId, now);
    if (institute?.status === "active") return institute;
  }
  return null;
}

/// The window worth telling a user about even before it blocks them — used
/// by /auth/me to drive the pre-start countdown banner. Prefers an active
/// window (shouldn't normally reach the client, since authenticate() already
/// blocked it, but kept for consistency) over the soonest upcoming one.
export async function getNoticeWindow(
  instituteId: string | null,
  now: Date = new Date()
): Promise<MaintenanceWindowInfo | null> {
  const candidates = [
    await getGlobalWindow(now),
    instituteId ? await getInstituteWindow(instituteId, now) : null,
  ].filter((w): w is MaintenanceWindowInfo => !!w && (w.status === "active" || w.status === "upcoming"));

  if (candidates.length === 0) return null;
  const active = candidates.find((w) => w.status === "active");
  if (active) return active;
  return candidates.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null;
}
