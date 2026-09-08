interface PhoneMockProps {
  /** Which portal screen to render inside the frame. */
  screen?: "home" | "fees";
  className?: string;
}

const LECTURES = [
  { time: "09:00", subject: "Physics · Rotational Motion", room: "Hall A" },
  { time: "11:30", subject: "Chemistry · Mole Concept", room: "Lab 2" },
  { time: "04:00", subject: "Maths · Mock Test 14", room: "Hall C" },
];

const INSTALLMENTS = [
  { label: "Installment 1", amount: "₹18,000", state: "Paid" as const },
  { label: "Installment 2", amount: "₹18,000", state: "Paid" as const },
  { label: "Installment 3", amount: "₹18,000", state: "Due" as const },
  { label: "Installment 4", amount: "₹18,000", state: "Upcoming" as const },
];

const STATE_CLASSES = {
  Paid: "bg-success-soft text-success",
  Due: "bg-warning-soft text-warning",
  Upcoming: "bg-secondary text-muted-foreground",
};

/**
 * A device frame around a static rendering of the student portal. Like
 * AppPreview, it is built from theme tokens rather than being a screenshot, so
 * it follows the palette and never drifts out of date on its own.
 */
export function PhoneMock({ screen = "home", className = "" }: PhoneMockProps) {
  return (
    <div
      aria-hidden="true"
      className={`relative w-[248px] shrink-0 select-none rounded-[2.25rem] border border-border bg-card p-2 shadow-(--shadow-overlay) ${className}`}
    >
      {/* Notch */}
      <div className="absolute left-1/2 top-3.5 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-foreground/15" />

      <div className="overflow-hidden rounded-[1.75rem] bg-background pb-4 pt-7">
        {screen === "home" ? (
          <div className="px-3.5">
            <p className="text-[10px] text-muted-foreground">Good morning</p>
            <p className="font-display text-sm font-semibold text-foreground">Aarav Mehta</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-card p-2.5">
                <p className="text-[9px] text-muted-foreground">Attendance</p>
                <p className="font-display text-base font-semibold text-success">94%</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-2.5">
                <p className="text-[9px] text-muted-foreground">Fee balance</p>
                <p className="font-display text-base font-semibold text-foreground">₹36,000</p>
              </div>
            </div>

            <p className="mt-3.5 text-[10px] font-semibold text-foreground">Today</p>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {LECTURES.map((l) => (
                <div key={l.time} className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2">
                  <span className="font-display w-9 shrink-0 text-[10px] font-semibold text-accent">{l.time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] font-medium text-foreground">{l.subject}</span>
                    <span className="block text-[9px] text-muted-foreground">{l.room}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-3.5">
            <p className="font-display text-sm font-semibold text-foreground">Fees</p>
            <p className="text-[10px] text-muted-foreground">JEE Advanced · 2026</p>

            <div className="mt-3 rounded-xl bg-accent p-3 text-accent-foreground">
              <p className="text-[9px] opacity-80">Due now</p>
              <p className="font-display text-xl font-semibold">₹18,000</p>
              <div className="mt-2 flex h-7 items-center justify-center rounded-lg bg-accent-foreground/15 text-[10px] font-semibold">
                Pay with UPI
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              {INSTALLMENTS.map((inst) => (
                <div key={inst.label} className="flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-foreground">{inst.label}</span>
                  <span className="text-[10px] text-muted-foreground">{inst.amount}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${STATE_CLASSES[inst.state]}`}>
                    {inst.state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab bar */}
        <div className="mt-4 flex items-center justify-around border-t border-border px-2 pt-2.5">
          {["Home", "Fees", "Tests", "More"].map((tab, i) => (
            <span
              key={tab}
              className={`text-[9px] font-medium ${
                (screen === "fees" ? i === 1 : i === 0) ? "text-accent" : "text-muted-foreground"
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
