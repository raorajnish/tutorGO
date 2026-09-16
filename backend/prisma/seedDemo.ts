import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { seedDefaultExpenseCategories } from "../src/lib/expenseDefaults.js";

const ORG_CODE = "DEMO";
const INSTITUTE_CODE = "DEMO01";
const OWNER_EMAIL = "owner@demo.com";
const ADMIN_EMAIL = "admin@demo.com";
const ACCOUNTANT_EMAIL = "accountant@demo.com";
const FACULTY_EMAIL = "faculty@demo.com";
const RECEPTION_EMAIL = "reception@demo.com";
const STUDENT_EMAIL = "student@demo.com";
const DEMO_PASSWORD = "DemoPass@123";

async function main() {
  console.log("Starting full demo environment seeding...");

  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: "GROWTH" } });
  const allModules = await prisma.module.findMany();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // 1. Owner & Organization
  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash },
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      fullName: "Demo Owner",
      role: "OWNER",
      isActive: true,
      mustChangePassword: false,
    },
  });

  const org = await prisma.organization.upsert({
    where: { code: ORG_CODE },
    update: { ownerId: owner.id },
    create: { code: ORG_CODE, name: "Demo Academy", ownerId: owner.id },
  });

  // 2. Institute & Modules
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

  // 3. Create all roles (Admin, Accountant, Faculty, Receptionist)
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash, instituteId: institute.id },
    create: {
      instituteId: institute.id,
      email: ADMIN_EMAIL,
      passwordHash,
      fullName: "Demo Admin",
      role: "ADMIN",
      isActive: true,
      mustChangePassword: false,
    },
  });

  const accountantUser = await prisma.user.upsert({
    where: { email: ACCOUNTANT_EMAIL },
    update: { passwordHash, instituteId: institute.id },
    create: {
      instituteId: institute.id,
      email: ACCOUNTANT_EMAIL,
      passwordHash,
      fullName: "Priya Verma",
      role: "ACCOUNTANT",
      isActive: true,
      mustChangePassword: false,
    },
  });

  const facultyUser = await prisma.user.upsert({
    where: { email: FACULTY_EMAIL },
    update: { passwordHash, instituteId: institute.id },
    create: {
      instituteId: institute.id,
      email: FACULTY_EMAIL,
      passwordHash,
      fullName: "Prof. Rahul Sharma",
      role: "FACULTY",
      isActive: true,
      mustChangePassword: false,
    },
  });

  const receptionUser = await prisma.user.upsert({
    where: { email: RECEPTION_EMAIL },
    update: { passwordHash, instituteId: institute.id },
    create: {
      instituteId: institute.id,
      email: RECEPTION_EMAIL,
      passwordHash,
      fullName: "Sneha Patil",
      role: "RECEPTION",
      isActive: true,
      mustChangePassword: false,
    },
  });

  // 4. Academic Setup (Course, Subjects, Batches)
  let course = await prisma.course.findFirst({ where: { instituteId: institute.id, code: "C10-SM" } });
  if (!course) {
    course = await prisma.course.create({
      data: {
        instituteId: institute.id,
        name: "Class 10 Science & Maths",
        code: "C10-SM",
        description: "Comprehensive curriculum for Class 10 board exams.",
        defaultFee: 60000,
        portalEnabled: true,
      },
    });
  }

  const subjectPhysics =
    (await prisma.subject.findFirst({ where: { instituteId: institute.id, shortCode: "PHY10" } })) ??
    (await prisma.subject.create({ data: { instituteId: institute.id, name: "Physics", shortCode: "PHY10" } }));

  const subjectMaths =
    (await prisma.subject.findFirst({ where: { instituteId: institute.id, shortCode: "MATH10" } })) ??
    (await prisma.subject.create({ data: { instituteId: institute.id, name: "Mathematics", shortCode: "MATH10" } }));

  await prisma.courseSubject.upsert({
    where: { courseId_subjectId: { courseId: course.id, subjectId: subjectPhysics.id } },
    update: {},
    create: { courseId: course.id, subjectId: subjectPhysics.id },
  });

  await prisma.courseSubject.upsert({
    where: { courseId_subjectId: { courseId: course.id, subjectId: subjectMaths.id } },
    update: {},
    create: { courseId: course.id, subjectId: subjectMaths.id },
  });

  const batchA =
    (await prisma.batch.findFirst({ where: { instituteId: institute.id, courseId: course.id, name: "Batch A - Morning" } })) ??
    (await prisma.batch.create({ data: { instituteId: institute.id, courseId: course.id, name: "Batch A - Morning", startDate: new Date("2025-04-01") } }));

  const batchB =
    (await prisma.batch.findFirst({ where: { instituteId: institute.id, courseId: course.id, name: "Batch B - Evening" } })) ??
    (await prisma.batch.create({ data: { instituteId: institute.id, courseId: course.id, name: "Batch B - Evening", startDate: new Date("2025-04-01") } }));

  // 5. Staff Profile (SalaryProfile)
  let staffSalaryProfile = await prisma.salaryProfile.findFirst({ where: { instituteId: institute.id, userId: accountantUser.id } });
  if (!staffSalaryProfile) {
    staffSalaryProfile = await prisma.salaryProfile.create({
      data: {
        instituteId: institute.id,
        userId: accountantUser.id,
        title: "Senior Accountant",
        salaryType: "FIXED",
        monthlyRate: 45000,
      },
    });
  }

  // 6. Students & Student User Accounts
  const studentUser = await prisma.user.upsert({
    where: { email: STUDENT_EMAIL },
    update: { passwordHash, instituteId: institute.id },
    create: {
      instituteId: institute.id,
      email: STUDENT_EMAIL,
      passwordHash,
      fullName: "Aarav Patel",
      role: "STUDENT",
      isActive: true,
      mustChangePassword: false,
    },
  });

  let student1 = await prisma.student.findFirst({ where: { instituteId: institute.id, studentCode: "DEMO-1001" } });
  if (!student1) {
    student1 = await prisma.student.create({
      data: {
        instituteId: institute.id,
        userId: studentUser.id,
        studentCode: "DEMO-1001",
        courseId: course.id,
        name: "Aarav Patel",
        email: STUDENT_EMAIL,
        phone: "+91 91234 56789",
        parentPhone: "+91 91234 56780",
        fatherName: "Suresh Patel",
        motherName: "Kavita Patel",
        dob: new Date("2010-05-14"),
        admissionDate: new Date("2025-04-05"),
        isActive: true,
        batches: { create: [{ batchId: batchA.id, joinedAt: new Date() }] },
      },
    });
  }

  let student2 = await prisma.student.findFirst({ where: { instituteId: institute.id, studentCode: "DEMO-1002" } });
  if (!student2) {
    student2 = await prisma.student.create({
      data: {
        instituteId: institute.id,
        studentCode: "DEMO-1002",
        courseId: course.id,
        name: "Ananya Iyer",
        email: "ananya.iyer@demo.com",
        phone: "+91 98111 22233",
        parentPhone: "+91 98111 22200",
        fatherName: "Ramesh Iyer",
        motherName: "Lakshmi Iyer",
        dob: new Date("2010-08-22"),
        admissionDate: new Date("2025-04-06"),
        isActive: true,
        batches: { create: [{ batchId: batchA.id, joinedAt: new Date() }] },
      },
    });
  }

  let student3 = await prisma.student.findFirst({ where: { instituteId: institute.id, studentCode: "DEMO-1003" } });
  if (!student3) {
    student3 = await prisma.student.create({
      data: {
        instituteId: institute.id,
        studentCode: "DEMO-1003",
        courseId: course.id,
        name: "Rohan Gupta",
        email: "rohan.gupta@demo.com",
        phone: "+91 97777 88899",
        dob: new Date("2010-11-03"),
        admissionDate: new Date("2025-04-10"),
        isActive: true,
        batches: { create: [{ batchId: batchB.id, joinedAt: new Date() }] },
      },
    });
  }

  // 7. Enquiries
  const existingEnquiries = await prisma.enquiry.count({ where: { instituteId: institute.id } });
  if (existingEnquiries === 0) {
    const eq1 = await prisma.enquiry.create({
      data: {
        instituteId: institute.id,
        courseId: course.id,
        name: "Vikram Malhotra",
        phone: "+91 99887 76655",
        source: "WALK_IN",
        status: "NEW",
        notes: "Interested in Class 10 Science & Maths batch.",
      },
    });
    const eq2 = await prisma.enquiry.create({
      data: {
        instituteId: institute.id,
        courseId: course.id,
        name: "Neha Singh",
        phone: "+91 98888 77777",
        source: "REFERRAL",
        status: "CONTACTED",
        notes: "Parent inquired about weekend batch timings.",
      },
    });
    await prisma.enquiryActivity.create({
      data: {
        enquiryId: eq2.id,
        type: "CONTACTED",
        note: "Called parent, sent fee brochure via WhatsApp.",
        createdByName: admin.fullName,
      },
    });
  }

  // 8. Fees & Accounts
  const existingFeeAccs = await prisma.feeAccount.count({ where: { instituteId: institute.id } });
  if (existingFeeAccs === 0) {
    const feeAcc1 = await prisma.feeAccount.create({
      data: {
        instituteId: institute.id,
        studentId: student1.id,
        planType: "ONE_TIME",
        courseFee: 60000,
        discount: 5000,
        finalFee: 55000,
        status: "ACTIVE",
        installments: {
          create: [
            { seq: 1, dueDate: new Date("2025-05-10"), amount: 20000 },
            { seq: 2, dueDate: new Date("2025-09-10"), amount: 20000 },
            { seq: 3, dueDate: new Date("2026-01-10"), amount: 15000 },
          ],
        },
      },
      include: { installments: true },
    });

    // Payment Transaction & Allocation
    const payment = await prisma.payment.create({
      data: {
        instituteId: institute.id,
        feeAccountId: feeAcc1.id,
        receiptNumber: "REC-2025-001",
        amount: 20000,
        mode: "UPI",
        paidOn: new Date("2025-05-08"),
        createdByUserId: admin.id,
        allocations: {
          create: [
            { installmentId: feeAcc1.installments[0].id, amount: 20000 },
          ],
        },
      },
    });

    await prisma.financeEntry.create({
      data: {
        instituteId: institute.id,
        kind: "INCOME",
        sourceType: "FEE_RECEIPT",
        sourceId: payment.id,
        amount: 20000,
        date: new Date("2025-05-08"),
        description: `Fee Receipt ${payment.receiptNumber} - Aarav Patel`,
        feeReceiptId: payment.id,
      },
    });

    await prisma.feeAccount.create({
      data: {
        instituteId: institute.id,
        studentId: student2.id,
        planType: "ONE_TIME",
        courseFee: 60000,
        discount: 0,
        finalFee: 60000,
        status: "ACTIVE",
        installments: {
          create: [
            { seq: 1, dueDate: new Date("2025-05-10"), amount: 20000 },
            { seq: 2, dueDate: new Date("2025-09-10"), amount: 20000 },
            { seq: 3, dueDate: new Date("2026-01-10"), amount: 20000 },
          ],
        },
      },
    });
  }

  // 9. Lectures & Attendance
  const existingLectures = await prisma.lecture.count({ where: { instituteId: institute.id } });
  if (existingLectures === 0) {
    const lecture1 = await prisma.lecture.create({
      data: {
        instituteId: institute.id,
        batchId: batchA.id,
        subjectId: subjectPhysics.id,
        facultyId: facultyUser.id,
        note: "Laws of Motion & Friction",
        date: new Date(),
        startTime: new Date("1970-01-01T09:00:00Z"),
        endTime: new Date("1970-01-01T10:30:00Z"),
        kind: "LECTURE",
        attendance: {
          create: [
            { studentId: student1.id, status: "PRESENT" },
            { studentId: student2.id, status: "LATE" },
          ],
        },
      },
    });
  }

  // 10. Tests & Results
  const existingTests = await prisma.test.count({ where: { instituteId: institute.id } });
  if (existingTests === 0) {
    const test1 = await prisma.test.create({
      data: {
        instituteId: institute.id,
        courseId: course.id,
        subjectId: subjectPhysics.id,
        title: "Physics Unit Test 1",
        totalMarks: 50,
        passingMarks: 18,
        createdByUserId: admin.id,
      },
    });
  }

  // 11. Study Material (StudyResource)
  const existingMaterials = await prisma.studyResource.count({ where: { instituteId: institute.id } });
  if (existingMaterials === 0) {
    await prisma.studyResource.create({
      data: {
        instituteId: institute.id,
        courseId: course.id,
        subjectId: subjectPhysics.id,
        title: "Class 10 Physics Chapter 1 Notes",
        description: "Comprehensive handwritten notes with solved numericals.",
        kind: "FILE",
        assetUrl: "https://example.com/materials/physics-ch1.pdf",
        assetName: "Physics_Ch1_Notes.pdf",
        uploadedByUserId: admin.id,
      },
    });

    await prisma.studyResource.create({
      data: {
        instituteId: institute.id,
        courseId: course.id,
        subjectId: subjectMaths.id,
        title: "Class 10 Mathematics Formula Sheet 2026",
        description: "Quick revision formula sheet for algebra & geometry.",
        kind: "FILE",
        assetUrl: "https://example.com/materials/maths-formulas.pdf",
        assetName: "Maths_Formulas_2026.pdf",
        uploadedByUserId: admin.id,
      },
    });
  }

  // 12. Expenses & Ledger
  const rent = await prisma.expenseCategory.findFirstOrThrow({ where: { instituteId: institute.id, name: "Rent" } });
  const marketing = await prisma.expenseCategory.findFirstOrThrow({ where: { instituteId: institute.id, name: "Marketing" } });

  const event =
    (await prisma.event.findFirst({ where: { instituteId: institute.id, name: "Annual Science Exhibition 2026" } })) ??
    (await prisma.event.create({ data: { instituteId: institute.id, name: "Annual Science Exhibition 2026", notes: "Inter-school exhibition" } }));

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
          title: "Office stationery & whiteboard markers",
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
          title: "Science Exhibition promotional banners",
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
  }

  // 13. Payroll
  const existingPayroll = await prisma.payrollRun.count({ where: { instituteId: institute.id } });
  if (existingPayroll === 0 && staffSalaryProfile) {
    const pr = await prisma.payrollRun.create({
      data: {
        instituteId: institute.id,
        periodMonth: "2026-08",
        status: "APPROVED",
        approvedAt: new Date(),
        approvedByUserId: admin.id,
      },
    });
    await prisma.financeEntry.create({
      data: {
        instituteId: institute.id,
        kind: "PAYROLL",
        sourceType: "PAYROLL_PAYMENT",
        sourceId: pr.id,
        amount: 45000,
        date: new Date(),
        description: `Payroll Run Aug 2026`,
      },
    });
  }

  // 14. Distribution
  const existingDistribution = await prisma.distributionItem.count({ where: { instituteId: institute.id } });
  if (existingDistribution === 0) {
    await prisma.distributionItem.create({
      data: {
        instituteId: institute.id,
        courseId: course.id,
        name: "Class 10 Science Digest Set",
        totalSets: 50,
        isActive: true,
        receipts: {
          create: [
            { studentId: student1.id, receivedAt: new Date() },
            { studentId: student2.id },
          ],
        },
      },
    });
    await prisma.distributionItem.create({
      data: {
        instituteId: institute.id,
        name: "Institute ID Card & Lanyard",
        totalSets: 100,
        isActive: true,
        receipts: {
          create: [
            { studentId: student1.id, receivedAt: new Date() },
            { studentId: student2.id, receivedAt: new Date() },
          ],
        },
      },
    });
  }

  // 15. Parent Meetings (PTM)
  const existingPtm = await prisma.parentMeeting.count({ where: { instituteId: institute.id } });
  if (existingPtm === 0) {
    await prisma.parentMeeting.create({
      data: {
        instituteId: institute.id,
        title: "First Quarter Progress Review",
        courseId: course.id,
        batchId: batchA.id,
        date: new Date(),
        startTime: new Date("1970-01-01T14:00:00Z"),
        endTime: new Date("1970-01-01T16:00:00Z"),
        venue: "Conference Hall A",
        note: "Discuss academic performance and upcoming unit test targets.",
        createdByUserId: admin.id,
      },
    });
  }

  console.log("\nFull demo environment ready!");
  console.log("-------------------------------------------------------");
  console.log("SuperAdmin Credentials:");
  console.log(`  SuperAdmin  — ${process.env.SUPERADMIN_EMAIL ?? "superadmin@tutorgo.com"} / ${process.env.SUPERADMIN_PASSWORD ?? "SuperAdmin@123"}`);
  console.log("\nInstitute Credentials (Demo Main Campus / Demo Academy):");
  console.log(`  Owner       — ${OWNER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Admin       — ${ADMIN_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Accountant  — ${ACCOUNTANT_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Faculty     — ${FACULTY_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Reception   — ${RECEPTION_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  Student     — ${STUDENT_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("-------------------------------------------------------");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
