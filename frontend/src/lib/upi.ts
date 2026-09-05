/**
 * The single place a `upi://pay?…` string is built (changes-phase13.md §13.1).
 *
 * Both the "Open in payment app" deep link and the scannable QR read from
 * this one function, so the link a parent taps and the QR they scan can
 * never disagree about who is being paid or how much — the same "one
 * function builds it, every caller reuses it" rule the WhatsApp template
 * vars adopted in §11.2 after exactly that class of bug.
 */
export interface UpiPaymentDetails {
  upiId: string;
  payeeName?: string | null;
  /** Omitted from the URI when absent/zero — the payer's UPI app then asks
   * them for the amount, which is the correct behaviour for an open payment
   * rather than defaulting to some guess. */
  amount?: string | number | null;
  /** Transaction note — shows up on both sides' statements. */
  note?: string | null;
}

export function buildUpiUri({ upiId, payeeName, amount, note }: UpiPaymentDetails): string {
  const params = new URLSearchParams();
  params.set("pa", upiId);
  // `pn` is omitted entirely rather than sent empty: a blank payee name is
  // what produces the "Paid to undefined" rendering seen in the wild.
  if (payeeName) params.set("pn", payeeName);

  const numericAmount = amount === null || amount === undefined || amount === "" ? null : Number(amount);
  if (numericAmount !== null && Number.isFinite(numericAmount) && numericAmount > 0) {
    // UPI expects a plain decimal — toFixed(2) keeps "444" and "444.5" from
    // reaching a payment app in two different shapes.
    params.set("am", numericAmount.toFixed(2));
  }

  params.set("cu", "INR");
  if (note) params.set("tn", note);

  // URLSearchParams encodes spaces as "+", which some UPI apps pass through
  // literally into the payee name/note instead of decoding. %20 is read
  // correctly by all of them.
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}
