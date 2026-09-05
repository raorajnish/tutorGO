"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { todayInput } from "@/lib/format";
import type { ChannelHealth, PlatformHealth } from "@/lib/types";

function monthsAgoInput(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return todayInput(d);
}

function failureTone(rate: number): "success" | "warning" | "danger" {
  if (rate === 0) return "success";
  if (rate < 0.1) return "warning";
  return "danger";
}

function ChannelSummary({ label, channel }: { label: string; channel: ChannelHealth }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-lg font-semibold text-foreground">{channel.sent}</span>
        <span className="text-xs text-muted-foreground">sent</span>
        {channel.total > 0 && (
          <Badge tone={failureTone(channel.failureRate)}>{(channel.failureRate * 100).toFixed(1)}% failed</Badge>
        )}
      </div>
    </div>
  );
}

/** SuperAdmin-only, real signal beyond /platform's headline counts: is
 * messaging actually working, and where isn't it (changes-phase14.md §14.1).
 * Pure aggregation over OutboundMessage/MessageLog — no new tracking. */
export default function PlatformHealthPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Empty until mount, then defaulted client-side — same reasoning as the
  // Analytics tab: a date computed at render time can disagree between
  // server and client and trip a hydration warning.
  useEffect(() => {
    setFrom(monthsAgoInput(1));
    setTo(todayInput());
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    apiFetch<PlatformHealth>(`/platform/health?from=${from}&to=${to}`)
      .then(setHealth)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load platform health."))
      .finally(() => setLoading(false));
  }, [from, to]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Is messaging actually working, and for which institute isn&apos;t it — WhatsApp and email delivery, over the range below.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="WhatsApp sent"
          value={loading ? "…" : health?.overall.whatsapp.sent ?? 0}
          tone={loading || !health ? "primary" : failureTone(health.overall.whatsapp.failureRate) === "danger" ? "danger" : "primary"}
        />
        <StatCard
          label="Email sent"
          value={loading ? "…" : health?.overall.email.sent ?? 0}
          tone={loading || !health ? "accent" : failureTone(health.overall.email.failureRate) === "danger" ? "danger" : "accent"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-1 text-sm font-semibold text-foreground">WhatsApp delivery</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {health && health.overall.whatsapp.total > 0 ? `${(health.overall.whatsapp.failureRate * 100).toFixed(1)}%` : "—"}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">failure rate</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {health ? `${health.overall.whatsapp.failed} failed of ${health.overall.whatsapp.total} attempts` : "Loading…"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-1 text-sm font-semibold text-foreground">Email delivery</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {health && health.overall.email.total > 0 ? `${(health.overall.email.failureRate * 100).toFixed(1)}%` : "—"}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">bounce rate</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {health ? `${health.overall.email.failed} bounced of ${health.overall.email.total} attempts` : "Loading…"}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-foreground">By institute — worst first</p>

        <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Institute</th>
                <th className="px-4 py-2.5">WhatsApp</th>
                <th className="px-4 py-2.5">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={3}>
                      <SkeletonRow lines={2} />
                    </td>
                  </tr>
                ))}
              {!loading &&
                health?.institutes.map((inst) => (
                  <tr key={inst.instituteId}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{inst.instituteName}</p>
                      {inst.organizationName && <p className="text-xs text-muted-foreground">{inst.organizationName}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <ChannelSummary label="" channel={inst.whatsapp} />
                    </td>
                    <td className="px-4 py-3">
                      <ChannelSummary label="" channel={inst.email} />
                    </td>
                  </tr>
                ))}
              {!loading && health && health.institutes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No WhatsApp or email activity in this range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="space-y-3 sm:hidden">
          {!loading &&
            health?.institutes.map((inst) => (
              <div key={inst.instituteId} className="rounded-xl border border-border bg-card p-4">
                <p className="font-medium text-foreground">{inst.instituteName}</p>
                {inst.organizationName && <p className="text-xs text-muted-foreground">{inst.organizationName}</p>}
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <ChannelSummary label="WhatsApp" channel={inst.whatsapp} />
                  <ChannelSummary label="Email" channel={inst.email} />
                </div>
              </div>
            ))}
          {!loading && health && health.institutes.length === 0 && (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No activity in this range.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
