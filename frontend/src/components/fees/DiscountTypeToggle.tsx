"use client";

import type { DiscountType } from "@/lib/types";

/** ₹/% mode switch for a discount field. Deliberately not a generic
 * segmented-control primitive — this is the only two-way toggle of its kind
 * in the app today; worth extracting only if a third use case shows up. */
export function DiscountTypeToggle({ value, onChange }: { value: DiscountType; onChange: (next: DiscountType) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-border p-0.5">
      {(["FLAT", "PERCENT"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          aria-label={option === "FLAT" ? "Flat rupee discount" : "Percentage discount"}
          className={`w-9 rounded-md py-1.5 text-sm font-medium transition-colors ${
            value === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option === "FLAT" ? "₹" : "%"}
        </button>
      ))}
    </div>
  );
}
