import { ZipArchive } from "archiver";
import { prisma } from "../lib/prisma.js";
import { toCsv } from "../lib/csv.js";
import { money } from "../lib/money.js";

/**
 * A full CSV bundle of one institute's own data (changes-phase14.md §14.2) —
 * students, fee accounts/installments, payments, attendance, and payroll.
 * Zipped rather than a single giant file: an owner opening this wants
 * "students.csv" to mean students, not a 200-column mega-sheet.
 *
 * Streamed straight to the response by the caller (archiver is a Node
 * stream), never buffered whole in memory — the same reasoning as every
 * other export in this app staying CSV rather than inventing a heavier
 * format, just applied to several files instead of one.
 */
export function buildInstituteExportArchive(instituteId: string) {
  // archiver v8's API dropped the classic archiver("zip", opts) factory in
  // favor of format-specific classes — ZipArchive is its replacement.
  const archive = new ZipArchive({ zlib: { level: 9 } });

  (async () => {
    try {
      const students = await prisma.student.findMany({
        where: { instituteId },
        select: {
          studentCode: true,
          name: true,
          email: true,
          phone: true,
          parentPhone: true,
          admissionDate: true,
          isActive: true,
          course: { select: { name: true, code: true } },
        },
        orderBy: { studentCode: "asc" },
      });
      archive.append(
        toCsv([
          ["Student code", "Name", "Email", "Phone", "Parent phone", "Course", "Admission date", "Active"],
          ...students.map((s) => [
            s.studentCode,
            s.name,
            s.email,
            s.phone ?? "",
            s.parentPhone ?? "",
            `${s.course.name} (${s.course.code})`,
            s.admissionDate.toISOString().slice(0, 10),
            s.isActive ? "Yes" : "No",
          ]),
        ]),
        { name: "students.csv" }
      );

      const installments = await prisma.feeInstallment.findMany({
        where: { feeAccount: { instituteId } },
        select: {
          seq: true,
          dueDate: true,
          amount: true,
          paidAmount: true,
          waived: true,
          feeAccount: { select: { student: { select: { studentCode: true, name: true } } } },
        },
        orderBy: [{ feeAccount: { student: { studentCode: "asc" } } }, { seq: "asc" }],
      });
      archive.append(
        toCsv([
          ["Student code", "Student name", "Installment #", "Due date", "Amount", "Paid amount", "Waived"],
          ...installments.map((i) => [
            i.feeAccount.student.studentCode,
            i.feeAccount.student.name,
            String(i.seq),
            i.dueDate.toISOString().slice(0, 10),
            money(i.amount)!,
            money(i.paidAmount)!,
            i.waived ? "Yes" : "No",
          ]),
        ]),
        { name: "fee_installments.csv" }
      );

      const payments = await prisma.payment.findMany({
        where: { instituteId },
        select: {
          receiptNumber: true,
          amount: true,
          mode: true,
          paidOn: true,
          voidedAt: true,
          feeAccount: { select: { student: { select: { studentCode: true, name: true } } } },
        },
        orderBy: { paidOn: "asc" },
      });
      archive.append(
        toCsv([
          ["Receipt #", "Student code", "Student name", "Amount", "Mode", "Paid on", "Voided"],
          ...payments.map((p) => [
            p.receiptNumber,
            p.feeAccount.student.studentCode,
            p.feeAccount.student.name,
            money(p.amount)!,
            p.mode,
            p.paidOn.toISOString().slice(0, 10),
            p.voidedAt ? "Yes" : "No",
          ]),
        ]),
        { name: "payments.csv" }
      );

      const attendance = await prisma.attendanceRecord.findMany({
        where: { student: { instituteId } },
        select: {
          status: true,
          student: { select: { studentCode: true, name: true } },
          lecture: { select: { date: true, subject: { select: { name: true } } } },
        },
        orderBy: { lecture: { date: "asc" } },
      });
      archive.append(
        toCsv([
          ["Student code", "Student name", "Date", "Subject", "Status"],
          ...attendance.map((a) => [
            a.student.studentCode,
            a.student.name,
            a.lecture.date.toISOString().slice(0, 10),
            a.lecture.subject?.name ?? "",
            a.status,
          ]),
        ]),
        { name: "attendance.csv" }
      );

      const payrollPayments = await prisma.payrollPayment.findMany({
        where: { instituteId },
        select: {
          amount: true,
          mode: true,
          paidOn: true,
          voidedAt: true,
          salaryProfile: { select: { externalName: true, user: { select: { fullName: true } } } },
        },
        orderBy: { paidOn: "asc" },
      });
      archive.append(
        toCsv([
          ["Staff name", "Amount", "Mode", "Paid on", "Voided"],
          ...payrollPayments.map((p) => [
            p.salaryProfile.externalName ?? p.salaryProfile.user?.fullName ?? "—",
            money(p.amount)!,
            p.mode,
            p.paidOn.toISOString().slice(0, 10),
            p.voidedAt ? "Yes" : "No",
          ]),
        ]),
        { name: "payroll_payments.csv" }
      );

      const expenses = await prisma.expense.findMany({
        where: { instituteId },
        select: {
          date: true,
          amount: true,
          mode: true,
          referenceNo: true,
          notes: true,
          title: true,
          category: { select: { name: true } },
        },
        orderBy: { date: "asc" },
      });
      archive.append(
        toCsv([
          ["Date", "Title", "Category", "Amount", "Paid via", "Reference", "Notes"],
          ...expenses.map((e) => [
            e.date.toISOString().slice(0, 10),
            e.title,
            e.category?.name ?? "—",
            money(e.amount)!,
            e.mode,
            e.referenceNo ?? "",
            e.notes ?? "",
          ]),
        ]),
        { name: "expenses.csv" }
      );

      const enquiries = await prisma.enquiry.findMany({
        where: { instituteId },
        select: {
          createdAt: true,
          name: true,
          phone: true,
          status: true,
          nextFollowUpDate: true,
          course: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      archive.append(
        toCsv([
          ["Date", "Name", "Phone", "Course", "Status", "Next follow-up"],
          ...enquiries.map((eq) => [
            eq.createdAt.toISOString().slice(0, 10),
            eq.name,
            eq.phone ?? "",
            eq.course ? `${eq.course.name} (${eq.course.code})` : "",
            eq.status,
            eq.nextFollowUpDate ? eq.nextFollowUpDate.toISOString().slice(0, 10) : "",
          ]),
        ]),
        { name: "enquiries.csv" }
      );

      const tests = await prisma.test.findMany({
        where: { instituteId },
        select: {
          createdAt: true,
          title: true,
          totalMarks: true,
          passingMarks: true,
          subject: { select: { name: true } },
          course: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      archive.append(
        toCsv([
          ["Date Created", "Title", "Subject", "Course", "Max marks", "Passing marks"],
          ...tests.map((t) => [
            t.createdAt.toISOString().slice(0, 10),
            t.title,
            t.subject.name,
            t.course.name,
            String(t.totalMarks),
            t.passingMarks ? String(t.passingMarks) : "",
          ]),
        ]),
        { name: "tests.csv" }
      );

      const staff = await prisma.user.findMany({
        where: { instituteId, role: { not: "STUDENT" } },
        select: {
          fullName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
        },
        orderBy: { fullName: "asc" },
      });
      archive.append(
        toCsv([
          ["Name", "Email", "Phone", "Role", "Active"],
          ...staff.map((u) => [
            u.fullName,
            u.email,
            u.phone ?? "",
            u.role,
            u.isActive ? "Yes" : "No",
          ]),
        ]),
        { name: "staff.csv" }
      );

      archive.finalize();
    } catch (err) {
      archive.emit("error", err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return archive;
}
