"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { CreateOrganizationWizard } from "@/components/platform/CreateOrganizationWizard";

interface PlatformStats {
  organizations: number;
  activeOrganizations: number;
  institutes: number;
  tenantUsers: number;
  students: number;
  modules: number;
}

export default function PlatformOverviewPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  function loadStats() {
    apiFetch<PlatformStats>("/platform/stats")
      .then(setStats)
      .catch(() => setError("Could not load platform stats."));
  }

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Overview</h1>
        </div>
        <div className="flex gap-3">
          <Link href="/platform/organizations">
            <Button variant="secondary">Manage organizations</Button>
          </Link>
          <Button onClick={() => setCreateOpen(true)}>New organization</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Organizations" value={stats?.organizations ?? "—"} tone="primary" />
        <StatCard label="Active organizations" value={stats?.activeOrganizations ?? "—"} tone="success" />
        <StatCard label="Institutes" value={stats?.institutes ?? "—"} tone="accent" />
        <StatCard label="Tenant users" value={stats?.tenantUsers ?? "—"} tone="accent" />
        <StatCard label="Students" value={stats?.students ?? "—"} tone="warning" />
        <StatCard label="Available modules" value={stats?.modules ?? "—"} tone="warning" />
      </div>

      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-(--shadow-card)">
        Set up the platform&apos;s outbound email in{" "}
        <Link href="/platform/email-settings" className="font-medium text-primary underline underline-offset-2">
          Email settings
        </Link>{" "}
        so owner and admin invites are delivered automatically instead of showing a temp password
        inline.
      </div>

      <CreateOrganizationWizard
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={loadStats}
      />
    </div>
  );
}
