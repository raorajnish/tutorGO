import { randomBytes } from "node:crypto";
import { prisma } from "./prisma.js";
import { money } from "./money.js";

/** New opaque receipt-link token — 128 bits, base64url. Not the sequential
 * receiptNumber (guessable: try the next SEQ) and not the payment's cuid
 * (not designed to be shared). See Payment.publicToken in schema.prisma. */
export function newPublicToken(): string {
  return randomBytes(16).toString("base64url");
}

const receiptInclude = {
  institute: { select: { name: true, address: true, phone: true, email: true } },
  feeAccount: {
    select: {
      student: { select: { id: true, name: true, studentCode: true, course: { select: { name: true, code: true } } } },
    },
  },
  allocations: { include: { installment: { select: { seq: true, dueDate: true } } } },
} as const;

export type ReceiptRow = NonNullable<Awaited<ReturnType<typeof loadReceiptById>>>;

export function loadReceiptById(id: string) {
  return prisma.payment.findUnique({ where: { id }, include: receiptInclude });
}

export function loadReceiptByToken(publicToken: string) {
  return prisma.payment.findUnique({ where: { publicToken }, include: receiptInclude });
}

/** The one shape both the staff-side view and the public receipt page
 * render — a receipt documents this ONE payment (what it covered, against
 * which installment), not a statement of the whole fee account. */
export function serializeReceipt(payment: ReceiptRow) {
  return {
    receiptNumber: payment.receiptNumber,
    amount: money(payment.amount),
    mode: payment.mode,
    paidOn: payment.paidOn,
    notes: payment.notes,
    voided: payment.voidedAt !== null,
    voidReason: payment.voidReason,
    createdAt: payment.createdAt,
    institute: payment.institute,
    student: payment.feeAccount.student,
    allocations: payment.allocations
      .slice()
      .sort((a, b) => a.installment.seq - b.installment.seq)
      .map((a) => ({ installmentSeq: a.installment.seq, dueDate: a.installment.dueDate, amount: money(a.amount) })),
  };
}
