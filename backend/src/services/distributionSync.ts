import type { Prisma } from "../generated/prisma/client.js";

/** Gives a newly-created student pending receipt rows for every active
 * distribution item that applies to them (institute-wide items, plus items
 * scoped to their specific course) — so a roster created before they joined
 * doesn't silently miss them. Called from both admission paths: the normal
 * admit flow (admission.ts) and bulk-precreate (students.ts, §8f) — both
 * create real Student rows, so both need this, not just one.
 *
 * Must run inside the SAME transaction as the Student insert — if admission
 * fails and rolls back, these receipts must never have existed either. */
export async function createDistributionReceiptsForNewStudent(
  tx: Prisma.TransactionClient,
  instituteId: string,
  studentId: string,
  courseId: string
): Promise<void> {
  const items = await tx.distributionItem.findMany({
    where: { instituteId, isActive: true, OR: [{ courseId: null }, { courseId }] },
    select: { id: true },
  });
  if (items.length === 0) return;

  await tx.distributionReceipt.createMany({
    data: items.map((item) => ({ distributionItemId: item.id, studentId })),
  });
}
