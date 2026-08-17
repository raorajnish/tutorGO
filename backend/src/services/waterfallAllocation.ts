import { Prisma } from "../generated/prisma/client.js";

export interface AllocationTarget {
  id: string;
  outstanding: Prisma.Decimal;
}

export interface Allocation {
  id: string;
  amount: Prisma.Decimal;
}

export interface AllocationResult {
  allocations: Allocation[];
  leftover: Prisma.Decimal;
}

/** Applies `amount` across `targets` in the order given, filling each one's
 * outstanding balance before spilling into the next. Skips targets with
 * nothing outstanding. Whatever's left after every target is fully covered
 * is returned as `leftover` — callers decide whether that's an error (Fees:
 * reject) or a credit to carry forward (Payroll: accept as an advance). */
export function allocateWaterfall(targets: AllocationTarget[], amount: Prisma.Decimal): AllocationResult {
  let remaining = amount;
  const allocations: Allocation[] = [];

  for (const target of targets) {
    if (remaining.lte(0)) break;
    if (target.outstanding.lte(0)) continue;
    const applied = Prisma.Decimal.min(target.outstanding, remaining);
    allocations.push({ id: target.id, amount: applied });
    remaining = remaining.minus(applied);
  }

  return { allocations, leftover: remaining };
}
