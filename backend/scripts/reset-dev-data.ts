import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

/** Wipes all tenant/org data from the dev DB, keeping only SuperAdmin users,
 * the Plan catalog, and the Module catalog. Organization.deleteMany cascades
 * through Institute to every operational table (students, fees, attendance,
 * payroll, expenses, ...); step 2 mops up organization-owner Users left
 * behind (their instituteId was already null, and Organization.ownerId no
 * longer references them once their org row is gone). */
async function main() {
  const [orgCount, userCountBefore] = await Promise.all([prisma.organization.count(), prisma.user.count()]);
  console.log(`Found ${orgCount} organization(s), ${userCountBefore} user(s) total.`);

  console.log("Deleting all organizations (cascades to institutes and all tenant data)...");
  const { count: orgsDeleted } = await prisma.organization.deleteMany({});

  console.log("Deleting leftover non-SuperAdmin users (organization owners)...");
  const { count: usersDeleted } = await prisma.user.deleteMany({ where: { role: { not: "SUPERADMIN" } } });

  console.log("Clearing platform-wide logs...");
  const { count: messageLogsDeleted } = await prisma.messageLog.deleteMany({});
  const { count: auditLogsDeleted } = await prisma.auditLog.deleteMany({});

  const [orgsLeft, usersLeft, plansLeft, modulesLeft] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.plan.count(),
    prisma.module.count(),
  ]);

  console.log("\nDone. Deleted:");
  console.log(`  Organizations: ${orgsDeleted}`);
  console.log(`  Users (non-SuperAdmin): ${usersDeleted}`);
  console.log(`  Message logs: ${messageLogsDeleted}`);
  console.log(`  Audit logs: ${auditLogsDeleted}`);
  console.log("\nRemaining:");
  console.log(`  Organizations: ${orgsLeft}`);
  console.log(`  Users (should be just SuperAdmin): ${usersLeft}`);
  console.log(`  Plans: ${plansLeft}`);
  console.log(`  Modules: ${modulesLeft}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
