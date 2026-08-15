import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const MODULE_CATALOG: { code: "ENQUIRY" | "ADMISSION" | "ATTENDANCE" | "FEES" | "PAYROLL" | "EXPENSE"; label: string; description: string }[] = [
  { code: "ENQUIRY", label: "Enquiries", description: "Capture and track leads through the admissions pipeline." },
  { code: "ADMISSION", label: "Admissions", description: "Admit students and generate student records." },
  { code: "ATTENDANCE", label: "Attendance", description: "Schedule lectures and mark attendance, manual or biometric." },
  { code: "FEES", label: "Fees", description: "Fee accounts, installments, payments and receipts." },
  { code: "PAYROLL", label: "Payroll", description: "Faculty salary runs and payslips." },
  { code: "EXPENSE", label: "Expenses", description: "Track institute expenses and categories." },
];

const PLAN_CATALOG = [
  { code: "STARTER", name: "Starter", description: "For a single small institute getting started.", maxAdmins: 1, maxAccountants: 1, maxFaculty: 5, maxReception: 2, maxStudents: 100 },
  { code: "GROWTH", name: "Growth", description: "For a growing institute with a larger team.", maxAdmins: 3, maxAccountants: 2, maxFaculty: 20, maxReception: 5, maxStudents: 500 },
  { code: "ENTERPRISE", name: "Enterprise", description: "For large institutes with high headcount needs.", maxAdmins: 10, maxAccountants: 5, maxFaculty: 100, maxReception: 20, maxStudents: 5000 },
];

async function main() {
  console.log("Seeding module catalog...");
  for (const m of MODULE_CATALOG) {
    await prisma.module.upsert({
      where: { code: m.code },
      update: { label: m.label, description: m.description },
      create: m,
    });
  }

  console.log("Seeding plan catalog...");
  for (const p of PLAN_CATALOG) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: p,
      create: p,
    });
  }

  const superAdminEmail = process.env.SUPERADMIN_EMAIL;
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
  const superAdminName = process.env.SUPERADMIN_NAME ?? "Platform Admin";

  if (!superAdminEmail || !superAdminPassword) {
    throw new Error("SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in the environment");
  }

  console.log(`Seeding SuperAdmin (${superAdminEmail})...`);
  const passwordHash = await hashPassword(superAdminPassword);

  await prisma.user.upsert({
    where: { email: superAdminEmail.toLowerCase() },
    update: {},
    create: {
      email: superAdminEmail.toLowerCase(),
      passwordHash,
      fullName: superAdminName,
      role: "SUPERADMIN",
      instituteId: null,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const emailHost = process.env.EMAIL_HOST;
  const emailUser = process.env.EMAIL_USER;
  const emailPassword = process.env.EMAIL_PASSWORD;
  const emailFrom = process.env.EMAIL_FROM_ADDRESS;

  if (emailHost && emailUser && emailPassword && emailFrom) {
    console.log(`Seeding SMTP config (${emailHost})...`);
    await prisma.emailConfig.upsert({
      where: { id: "default" },
      update: {
        host: emailHost,
        port: Number(process.env.EMAIL_PORT ?? 587),
        secure: process.env.EMAIL_SECURE === "true",
        username: emailUser,
        password: emailPassword,
        fromName: process.env.EMAIL_FROM_NAME ?? "TutorGO",
        fromEmail: emailFrom,
      },
      create: {
        id: "default",
        host: emailHost,
        port: Number(process.env.EMAIL_PORT ?? 587),
        secure: process.env.EMAIL_SECURE === "true",
        username: emailUser,
        password: emailPassword,
        fromName: process.env.EMAIL_FROM_NAME ?? "TutorGO",
        fromEmail: emailFrom,
      },
    });
  } else {
    console.log("Skipping SMTP config seed — EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD/EMAIL_FROM_ADDRESS not set.");
  }

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
