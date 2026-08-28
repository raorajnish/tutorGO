const NAV_ITEMS = ["Dashboard", "Admissions", "Attendance", "Fees", "Payroll", "Reports"];

const TILES = [
  { label: "Active students", value: "1,248", delta: "+64", tone: "success" as const },
  { label: "Fees collected", value: "₹8.4L", delta: "+12%", tone: "success" as const },
  { label: "Attendance today", value: "92%", delta: "-3%", tone: "warning" as const },
];

const BARS = [42, 58, 47, 71, 63, 88, 76, 95, 82, 68, 91, 78];

const ROWS = [
  { name: "Aarav Mehta", batch: "JEE Advanced · B2", status: "Paid", tone: "success" as const },
  { name: "Diya Sharma", batch: "NEET Foundation · A1", status: "Due", tone: "warning" as const },
  { name: "Kabir Nair", batch: "Class 12 CBSE · C3", status: "Paid", tone: "success" as const },
];

const TONE_CLASSES = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
};

/**
 * A static, decorative rendering of the product UI for the hero. It is not a
 * screenshot — building it from real tokens means it tracks the theme (and any
 * palette change) instead of going stale like an exported image would.
 */
export function AppPreview() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-overlay) select-none"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-success/50" />
        <div className="ml-3 hidden h-5 flex-1 items-center rounded-md bg-background px-2.5 text-[10px] font-medium text-muted-foreground sm:flex">
          app.tutorgo.in/dashboard
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden w-40 shrink-0 flex-col gap-1 border-r border-border p-3 sm:flex lg:w-52 lg:gap-1.5 lg:p-4">
          {NAV_ITEMS.map((item, i) => (
            <div
              key={item}
              className={`rounded-lg px-2.5 py-2 text-[11px] font-medium lg:px-3 lg:py-2.5 lg:text-xs ${
                i === 0 ? "bg-accent/10 text-accent" : "text-muted-foreground"
              }`}
            >
              {item}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 p-4 sm:p-5 lg:p-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-sm font-semibold text-foreground lg:text-base">Good morning, Priya</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground lg:text-xs">Sunrise Academy · Owner</p>
            </div>
            <div className="hidden h-7 items-center rounded-lg bg-accent px-3 text-[10px] font-semibold text-accent-foreground sm:flex lg:h-9 lg:px-4 lg:text-xs">
              New admission
            </div>
          </div>

          {/* Stat tiles */}
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {TILES.map((tile) => (
              <div key={tile.label} className="rounded-xl border border-border p-2.5 sm:p-3 lg:p-4">
                <p className="truncate text-[9px] font-medium text-muted-foreground sm:text-[10px] lg:text-xs">
                  {tile.label}
                </p>
                <p className="font-display mt-1 text-sm font-semibold text-foreground sm:text-base lg:text-2xl">
                  {tile.value}
                </p>
                <span
                  className={`mt-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-semibold lg:px-2 lg:text-[11px] ${TONE_CLASSES[tile.tone]}`}
                >
                  {tile.delta}
                </span>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="mt-3 rounded-xl border border-border p-3 lg:mt-4 lg:p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-foreground lg:text-xs">Collections · last 12 weeks</p>
              <span className="hidden text-[9px] text-muted-foreground sm:block lg:text-[11px]">Weekly</span>
            </div>
            <div className="mt-3 flex h-16 items-end gap-1 sm:h-20 sm:gap-1.5 lg:h-32 lg:gap-2">
              {BARS.map((h, i) => (
                <div
                  key={i}
                  style={{ height: `${h}%` }}
                  className={`flex-1 rounded-sm ${i === BARS.length - 5 ? "bg-accent" : "bg-accent/25"}`}
                />
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-border sm:block lg:mt-4">
            {ROWS.map((row, i) => (
              <div
                key={row.name}
                className={`flex items-center gap-3 px-3 py-2.5 lg:px-4 lg:py-3 ${i > 0 ? "border-t border-border" : ""}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-secondary-foreground lg:h-8 lg:w-8 lg:text-[11px]">
                  {row.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-semibold text-foreground lg:text-xs">{row.name}</p>
                  <p className="truncate text-[9px] text-muted-foreground lg:text-[11px]">{row.batch}</p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-semibold lg:px-2.5 lg:py-1 lg:text-[11px] ${TONE_CLASSES[row.tone]}`}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
