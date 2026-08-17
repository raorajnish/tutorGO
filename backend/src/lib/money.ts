import { Prisma } from "../generated/prisma/client.js";

export function money(v: Prisma.Decimal | number | string | null | undefined): string | null {
  return v === null || v === undefined ? null : new Prisma.Decimal(v).toFixed(2);
}
