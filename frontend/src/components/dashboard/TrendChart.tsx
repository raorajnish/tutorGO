"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface TrendPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  title?: string;
  data: TrendPoint[];
  height?: number;
}

export function TrendChart({ title, data, height = 210 }: TrendChartProps) {
  const hasData = data && data.length > 0 && data.some((d) => Number(d.value) > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-6 transition-colors duration-150 hover:border-primary/30">
      {title && <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>}
      <div className={title ? "mt-4" : undefined}>
        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-6 text-center" style={{ minHeight: height }}>
            <div className="rounded-full bg-muted p-3 text-muted-foreground mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21H4.125A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-foreground">No trend activity in this range</p>
            <p className="text-xs text-muted-foreground mt-0.5">Select a different date range or course to view trend data.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="tg-trend-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              />
              <YAxis hide />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
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
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2.5}
                fill="url(#tg-trend-fill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
