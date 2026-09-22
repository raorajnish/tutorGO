import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tone?: "primary" | "accent" | "success" | "warning" | "danger";
}

const TONE_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  primary: "bg-secondary text-secondary-foreground",
  accent: "bg-accent/10 text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function StatCard({ label, value, icon, tone = "primary" }: StatCardProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-4 rounded-xl border border-border bg-card p-2 sm:p-4 shadow-(--shadow-card) transition-all duration-150 hover:border-primary/30 hover:shadow-(--shadow-card-hover)">
      {icon && (
        <div className={`flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg sm:rounded-xl ${TONE_CLASSES[tone]}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] sm:text-xs font-medium text-muted-foreground" title={label}>{label}</p>
        <p className="font-display mt-0.5 text-lg sm:text-2xl font-semibold text-foreground leading-tight">{value}</p>
      </div>
    </div>
  );
}
