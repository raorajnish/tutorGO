import type { Prisma } from "../generated/prisma/client.js";

/**
 * {INSTITUTE_CODE}-{YY}-{COURSE_CODE}-{SEQ} e.g. SP20-25-10-0007.
 * Must run inside the same transaction as the Student insert — a failed
 * admission must never burn a sequence number.
 */
export async function nextStudentCode(
  tx: Prisma.TransactionClient,
  instituteId: string,
  instituteCode: string,
  admissionDate: Date,
  courseCode: string
): Promise<string> {
  const year = admissionDate.getUTCFullYear() % 100;

  const counter = await tx.studentCodeCounter.upsert({
    where: { instituteId_year_courseCode: { instituteId, year, courseCode } },
    create: { instituteId, year, courseCode, seq: 1 },
    update: { seq: { increment: 1 } },
  });

  return `${instituteCode}-${String(year).padStart(2, "0")}-${courseCode}-${String(counter.seq).padStart(4, "0")}`;
}
