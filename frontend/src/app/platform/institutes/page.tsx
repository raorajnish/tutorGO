"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { InviteAdminModal } from "@/components/platform/InviteAdminModal";
import type { PlatformInstituteListItem } from "@/lib/types";

function AdminStatus({ institute }: { institute: PlatformInstituteListItem }) {
  if (!institute.hasAdmin) return <span className="text-xs text-muted-foreground">No admin</span>;
  if (institute.adminPendingOnboarding) return <Badge tone="warning">Pending onboarding</Badge>;
  return <Badge tone="success">Onboarded</Badge>;
}

export default function PlatformInstitutesPage() {
  const router = useRouter();
  const [institutes, setInstitutes] = useState<PlatformInstituteListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteAdminFor, setInviteAdminFor] = useState<PlatformInstituteListItem | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      setInstitutes(await apiFetch<PlatformInstituteListItem[]>(`/platform/institutes${qs}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load institutes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function goToInstitute(inst: PlatformInstituteListItem) {
    router.push(`/platform/organizations/${inst.organization.id}/institutes/${inst.id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Institutes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every institute across every organization on the platform.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total institutes" value={institutes.length} tone="primary" />
        <StatCard label="Active" value={institutes.filter((i) => i.isActive).length} tone="success" />
        <StatCard label="Inactive" value={institutes.filter((i) => !i.isActive).length} tone="warning" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Input
            placeholder="Search institute, organization, code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button variant="ghost" onClick={load}>
            Refresh
          </Button>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Institute</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Modules</th>
                <th className="px-4 py-3 font-medium">Admin</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {institutes.map((inst) => (
                <tr key={inst.id} onClick={() => goToInstitute(inst)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{inst.name}</p>
                    <p className="text-xs text-muted-foreground">{inst.code}{inst.city ? ` · ${inst.city}` : ""}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {inst.organization.name} <span className="text-muted-foreground">· {inst.organization.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="primary">{inst.plan?.name ?? "No plan"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground">{inst.activeModuleCount} active</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {inst.hasAdmin ? (
                      <AdminStatus institute={inst} />
                    ) : (
                      <Button variant="ghost" onClick={() => setInviteAdminFor(inst)}>
                        Invite admin
                      </Button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={inst.isActive ? "success" : "danger"}>{inst.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                </tr>
              ))}
              {!loading && institutes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No institutes on the platform yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {institutes.map((inst) => (
            <div key={inst.id} onClick={() => goToInstitute(inst)} className="space-y-1.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-foreground">{inst.name}</p>
                <Badge tone={inst.isActive ? "success" : "danger"}>{inst.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{inst.code} · {inst.organization.name}</p>
              <p className="text-xs text-muted-foreground">{inst.plan?.name ?? "No plan"} · {inst.activeModuleCount} modules</p>
              <div onClick={(e) => e.stopPropagation()}>
                {inst.hasAdmin ? (
                  <AdminStatus institute={inst} />
                ) : (
                  <Button variant="secondary" onClick={() => setInviteAdminFor(inst)}>
                    Invite admin
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!loading && institutes.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No institutes on the platform yet.</p>
          )}
        </div>
      </div>

      {inviteAdminFor && (
        <InviteAdminModal
          open={!!inviteAdminFor}
          onClose={() => setInviteAdminFor(null)}
          onInvited={load}
          organizationId={inviteAdminFor.organization.id}
          instituteId={inviteAdminFor.id}
          instituteName={inviteAdminFor.name}
        />
      )}
    </div>
  );
}
