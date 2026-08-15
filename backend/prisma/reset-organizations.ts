import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

/**
 * One-off cleanup: wipes all Organizations/Institutes/InstituteModules and any
 * non-SUPERADMIN Users (cascades from Institute deletion, plus org owners),
 * leaving the SuperAdmin account and the Module/Plan catalogs untouched.
 */
async function main() {
  const orgCount = await prisma.organization.count();
  console.log(`Deleting ${orgCount} organization(s) (cascades institutes, modules, org-scoped users)...`);
  await prisma.organization.deleteMany({});

  const strayUsers = await prisma.user.deleteMany({ where: { role: { not: "SUPERADMIN" } } });
  console.log(`Removed ${strayUsers.count} stray non-SuperAdmin user(s).`);

  console.log("Reset complete — SuperAdmin, modules, and plans preserved.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
