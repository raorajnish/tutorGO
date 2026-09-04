"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/money";
import type { InstituteAnalytics } from "@/lib/types";

interface FinanceChartProps {
  data: InstituteAnalytics["finance"]["trend"];
  height?: number;
}

const SERIES = [
  { key: "income", label: "Fees collected", color: "var(--success)" },
  { key: "payroll", label: "Payroll", color: "var(--warning)" },
  { key: "expenses", label: "Expenses", color: "var(--danger)" },
  { key: "net", label: "Net", color: "var(--accent)" },
] as const;

/** Month-by-month income vs. payroll vs. expenses vs. net — the P&L-style
 * view TrendChart's single-series API can't express, so this is its own
 * small component rather than overloading that one's props. Same
 * theme-token styling so it reads as part of the same chart family. */
export function FinanceChart({ data, height = 260 }: FinanceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        No fee, payroll, or expense activity in this range yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          width={40}
        />
        <Tooltip
          formatter={(value, name) => [formatMoney(typeof value === "number" ? value : Number(value)), name]}
          contentStyle={{
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--card-foreground)",
            fontSize: 12,
            boxShadow: "var(--shadow-card-hover)",
          }}
          labelStyle={{ color: "var(--muted-foreground)" }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={s.key === "net" ? 2.75 : 2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
