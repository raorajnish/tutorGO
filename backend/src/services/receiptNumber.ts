import type { Prisma } from "../generated/prisma/client.js";

/**
 * RCT-{YYMM}-{SEQ} e.g. RCT-2608-0007. One gapless sequence per (institute,
 * year+month). Must run inside the same transaction as the Payment insert —
 * a failed payment must never burn a sequence number.
 */
export async function nextReceiptNumber(tx: Prisma.TransactionClient, instituteId: string, paidOn: Date): Promise<string> {
  const yearMonth = `${String(paidOn.getUTCFullYear() % 100).padStart(2, "0")}${String(paidOn.getUTCMonth() + 1).padStart(2, "0")}`;

  const counter = await tx.receiptCounter.upsert({
    where: { instituteId_yearMonth: { instituteId, yearMonth } },
    create: { instituteId, yearMonth, seq: 1 },
    update: { seq: { increment: 1 } },
  });

  return `RCT-${yearMonth}-${String(counter.seq).padStart(4, "0")}`;
}
