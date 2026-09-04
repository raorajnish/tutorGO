import { Prisma } from "../generated/prisma/client.js";
import { ApiError } from "./http.js";
import type { DiscountType } from "../generated/prisma/enums.js";

/**
 * The one place `finalFee` is derived from `courseFee` + `discount` +
 * `discountType` — called from both account creation and the repricing route
 * in fees.ts. A PERCENT discount above 100 is rejected here rather than left
 * to produce a negative fee silently.
 */
export function computeFinalFee(courseFee: Prisma.Decimal, discount: Prisma.Decimal, discountType: DiscountType): Prisma.Decimal {
  if (discountType === "PERCENT") {
    if (discount.gt(100)) throw ApiError.badRequest("A percentage discount can't be more than 100%.");
    const off = courseFee.times(discount).dividedBy(100);
    return courseFee.minus(off);
  }

  const finalFee = courseFee.minus(discount);
  if (finalFee.lt(0)) throw ApiError.badRequest("Discount can't be more than the course fee");
  return finalFee;
}
