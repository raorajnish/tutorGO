/** Prisma Decimal fields serialize as strings over JSON — this is the one
 * parse/format pair used consistently everywhere money crosses the wire, so
 * there's no risk of float drift from ad-hoc Number() calls scattered around. */

export function parseMoney(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(v: string | number | null | undefined, options?: { noDecimals?: boolean }): string {
  const n = typeof v === "number" ? v : parseMoney(v);
  const digits = options?.noDecimals ? 0 : 2;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
