"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { CreateOrganizationWizard } from "@/components/platform/CreateOrganizationWizard";
import { OrganizationDetailModal } from "@/components/platform/OrganizationDetailModal";
import { AddOwnerModal } from "@/components/platform/AddOwnerModal";
import type { InviteResult, OrganizationListItem } from "@/lib/types";

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resendState, setResendState] = useState<Record<string, string | null>>({});
  const [addOwnerFor, setAddOwnerFor] = useState<OrganizationListItem | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const data = await apiFetch<OrganizationListItem[]>(`/platform/organizations${qs}`);
      setOrganizations(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load organizations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function resendInvite(id: string) {
    setResendState((s) => ({ ...s, [id]: "sending" }));
    try {
      const res = await apiFetch<InviteResult>(`/platform/organizations/${id}/resend-invite`, { method: "POST" });
      setResendState((s) => ({
        ...s,
        [id]: res.emailDelivered
          ? "Invite re-sent."
          : `Not sent${res.error ? ` — ${res.error}` : ""}. Temp password: ${res.tempPassword}`,
      }));
    } catch {
      setResendState((s) => ({ ...s, [id]: "Failed to resend" }));
    }
  }

  const totalInstitutes = organizations.reduce((sum, o) => sum + o.instituteCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Organizations</h1>
          <p className="mt-1 text-sm text-muted-foreground">Provision customer workspaces and their institutes.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New organization</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total organizations" value={organizations.length} tone="primary" />
        <StatCard label="Active" value={organizations.filter((o) => o.isActive).length} tone="success" />
        <StatCard label="Institutes" value={totalInstitutes} tone="accent" />
        <StatCard label="Inactive" value={organizations.filter((o) => !o.isActive).length} tone="warning" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Input
            placeholder="Search name, code, city, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button variant="ghost" onClick={load}>
            Refresh
          </Button>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Institutes</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={5}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
              {!loading && organizations.map((org) => (
                <tr
                  key={org.id}
                  onClick={() => setDetailId(org.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">
                      {org.name} <span className="text-muted-foreground">· {org.code}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[org.city, org.state].filter(Boolean).join(", ") || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {org.ownerEmail ? (
                      <>
                        <p className="text-foreground">{org.ownerName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{org.ownerEmail}</p>
                        {org.ownerMustChangePassword && <Badge tone="warning">Temp password</Badge>}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">No owner yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {org.activeInstituteCount} / {org.instituteCount} active
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={org.isActive ? "success" : "danger"}>{org.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col items-start gap-1">
                      {org.ownerEmail ? (
                        <Button variant="ghost" onClick={() => resendInvite(org.id)}>
                          Resend invite
                        </Button>
                      ) : (
                        <Button variant="ghost" onClick={() => setAddOwnerFor(org)}>
                          Add owner
                        </Button>
                      )}
                      {resendState[org.id] && <span className="text-xs text-muted-foreground">{resendState[org.id]}</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && organizations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No organizations yet — create the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-border sm:hidden">
          {loading && Array.from({ length: 6 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
          {!loading && organizations.map((org) => (
            <div key={org.id} className="space-y-2 p-4" onClick={() => setDetailId(org.id)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{org.name}</p>
                  <p className="text-xs text-muted-foreground">{org.code}</p>
                </div>
                <Badge tone={org.isActive ? "success" : "danger"}>{org.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {org.ownerEmail ? `${org.ownerName} · ${org.ownerEmail}` : "No owner yet"}
              </p>
              <p className="text-xs text-muted-foreground">
                {org.activeInstituteCount} / {org.instituteCount} institutes active
              </p>
              {!org.ownerEmail && (
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddOwnerFor(org);
                  }}
                >
                  Add owner
                </Button>
              )}
            </div>
          ))}
          {!loading && organizations.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No organizations yet — create the first one.</p>
          )}
        </div>
      </div>

      <CreateOrganizationWizard open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      <OrganizationDetailModal organizationId={detailId} onClose={() => setDetailId(null)} />
      {addOwnerFor && (
        <AddOwnerModal
          open={!!addOwnerFor}
          onClose={() => setAddOwnerFor(null)}
          onAdded={load}
          organizationId={addOwnerFor.id}
          organizationName={addOwnerFor.name}
        />
      )}
    </div>
  );
}
