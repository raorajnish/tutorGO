import type { Prisma } from "../generated/prisma/client.js";

const DEFAULT_CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Marketing",
  "Stationery",
  "Transport",
  "Miscellaneous",
];

/** Every institute starts with this standard set so the Expenses screen
 * isn't a blank list on day one — owners/admins can rename, deactivate, or
 * add their own categories on top afterwards. */
export async function seedDefaultExpenseCategories(tx: Prisma.TransactionClient, instituteId: string) {
  await tx.expenseCategory.createMany({
    data: DEFAULT_CATEGORIES.map((name) => ({ instituteId, name })),
    skipDuplicates: true,
  });
}
