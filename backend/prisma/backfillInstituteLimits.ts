import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

/**
 * One-time backfill for the per-institute limit snapshot (Institute.maxAdmins
 * and friends — see lib/instituteLimits.ts).
 *
 * Institutes created before those columns existed have them null, which means
 * they still read through to the live Plan row. That is exactly the behaviour
 * the snapshot exists to end: until this runs, a superadmin editing a Plan
 * still silently moves every legacy institute's ceiling.
 *
 * Copies each institute's CURRENT plan values, so nothing changes for anyone
 * at the moment it runs — it only freezes where they already are.
 *
 * Idempotent: institutes that already have a snapshot are skipped, so re-running
 * it can never overwrite a deliberate per-institute override.
 *
 *   npm run db:backfill-limits
 */
async function main() {
  const institutes = await prisma.institute.findMany({
    where: {
      planId: { not: null },
      // "No snapshot yet" — planLimitsSetAt is stamped by every write path
      // that sets these columns, so it's the reliable marker.
      planLimitsSetAt: null,
    },
    include: { plan: true },
  });

  if (institutes.length === 0) {
    console.log("Nothing to backfill — every institute with a plan already has its own limits.");
    return;
  }

  let updated = 0;
  for (const institute of institutes) {
    if (!institute.plan) continue;
    await prisma.institute.update({
      where: { id: institute.id },
      data: {
        maxAdmins: institute.plan.maxAdmins,
        maxAccountants: institute.plan.maxAccountants,
        maxFaculty: institute.plan.maxFaculty,
        maxReception: institute.plan.maxReception,
        maxStudents: institute.plan.maxStudents,
        planLimitsSetAt: new Date(),
      },
    });
    updated += 1;
    console.log(`  ${institute.code} — froze at ${institute.plan.name} limits`);
  }

  console.log(`\nBackfilled ${updated} institute(s). Plan edits no longer reach any of them.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
