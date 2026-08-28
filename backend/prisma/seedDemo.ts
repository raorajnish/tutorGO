import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { seedDefaultExpenseCategories } from "../src/lib/expenseDefaults.js";

const ORG_CODE = "DEMO";
const INSTITUTE_CODE = "DEMO01";
const OWNER_EMAIL = "demo.owner@tutorgo.local";
const ADMIN_EMAIL = "demo.admin@tutorgo.local";
const DEMO_PASSWORD = "DemoPass@123";

/** Not part of the base seed (superadmin + plan/module catalog only) — run
 * this separately (`npm run db:seed:demo`) to stand up one fully-populated
 * institute for manually exercising new features end-to-end: Expenses
 * (categories, events, general + event expenses, combined ledger), the
 * forgot-password OTP flow, plan admin-limit enforcement, and the
 * self-deactivation guard. */
async function main() {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "GROWTH" } });
  const allModules = await prisma.module.findMany();

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: {},
    create: {
      email: OWNER_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      fullName: "Demo Owner",
      role: "OWNER",
      isActive: true,
      mustChangePassword: false,
    },
  });

  const org = await prisma.organization.upsert({
    where: { code: ORG_CODE },
    update: {},
    create: { code: ORG_CODE, name: "Demo Academy", ownerId: owner.id },
  });

  let institute = await prisma.institute.findUnique({ where: { code: INSTITUTE_CODE } });
  if (!institute) {
    institute = await prisma.$transaction(async (tx) => {
      const created = await tx.institute.create({
        data: {
          organizationId: org.id,
          planId: plan.id,
          code: INSTITUTE_CODE,
          name: "Demo Main Campus",
          city: "Mumbai",
          state: "Maharashtra",
          onboardingDone: true,
        },
      });
      await tx.instituteModule.createMany({
        data: allModules.map((m) => ({ instituteId: created.id, moduleId: m.id, isActive: true })),
      });
      await seedDefaultExpenseCategories(tx, created.id);
      return created;
    });
    console.log(`Created institute ${INSTITUTE_CODE}`);
  }

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {},
    create: {
      instituteId: institute.id,
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      fullName: "Demo Admin",
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
    },
  });

  const rent = await prisma.expenseCategory.findFirstOrThrow({ where: { instituteId: institute.id, name: "Rent" } });
  const marketing = await prisma.expenseCategory.findFirstOrThrow({ where: { instituteId: institute.id, name: "Marketing" } });

  const event =
    (await prisma.event.findFirst({ where: { instituteId: institute.id, name: "Annual Day 2026" } })) ??
    (await prisma.event.create({ data: { instituteId: institute.id, name: "Annual Day 2026", notes: "End-of-year celebration" } }));

  const existingExpenses = await prisma.expense.count({ where: { instituteId: institute.id } });
  if (existingExpenses === 0) {
    await prisma.$transaction(async (tx) => {
      const generalExpense = await tx.expense.create({
        data: {
          instituteId: institute!.id,
          categoryId: rent.id,
          title: "August office rent",
          amount: 25000,
          date: new Date(),
          mode: "BANK_TRANSFER",
          referenceNo: "UTR1234567890",
          createdByUserId: admin.id,
        },
      });
      await tx.financeEntry.create({
        data: {
          instituteId: institute!.id,
          kind: "EXPENSE",
          sourceType: "EXPENSE",
          sourceId: generalExpense.id,
          amount: generalExpense.amount,
          date: generalExpense.date,
          description: `${generalExpense.title} (Rent)`,
          expenseId: generalExpense.id,
        },
      });

      const cashExpense = await tx.expense.create({
        data: {
          instituteId: institute!.id,
          categoryId: rent.id,
          title: "Office stationery",
          amount: 1200,
          date: new Date(),
          mode: "CASH",
          createdByUserId: admin.id,
        },
      });
      await tx.financeEntry.create({
        data: {
          instituteId: institute!.id,
          kind: "EXPENSE",
          sourceType: "EXPENSE",
          sourceId: cashExpense.id,
          amount: cashExpense.amount,
          date: cashExpense.date,
          description: `${cashExpense.title} (Rent)`,
          expenseId: cashExpense.id,
        },
      });

      const eventExpense = await tx.expense.create({
        data: {
          instituteId: institute!.id,
          categoryId: marketing.id,
          eventId: event.id,
          title: "Annual Day banners",
          amount: 8000,
          date: new Date(),
          mode: "UPI",
          referenceNo: "UPI9876543210",
          createdByUserId: admin.id,
        },
      });
      await tx.financeEntry.create({
        data: {
          instituteId: institute!.id,
          kind: "EXPENSE",
          sourceType: "EXPENSE",
          sourceId: eventExpense.id,
          amount: eventExpense.amount,
          date: eventExpense.date,
          description: `${eventExpense.title} (Marketing)`,
          expenseId: eventExpense.id,
        },
      });
    });
    console.log("Seeded demo categories, event, and 3 expenses.");
  }

  console.log("\nDemo institute ready:");
  console.log(`  Owner — ${OWNER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Admin — ${ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Institute plan: ${plan.name} (maxAdmins=${plan.maxAdmins}) — invite one more admin to test the plan limit.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
