"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { SkeletonRow } from "@/components/ui/Skeleton";
import type { PlatformUser, Role } from "@/lib/types";
import { formatDate } from "@/lib/format";

const ROLE_OPTIONS: Role[] = ["OWNER", "ADMIN", "ACCOUNTANT", "FACULTY", "RECEPTION"];

/** Platform-wide user directory — filled in by changes-phase12.md §12.6 as
 * the surface for the SuperAdmin's "disable MFA on any account" escape
 * hatch (the "lost my phone and my backup codes" case, which otherwise has
 * no recovery path). One place for every staff role across every
 * organization/institute, rather than duplicating the action on each
 * institute's own team list (which doesn't even show FACULTY/RECEPTION). */
export default function PlatformUsersPage() {
  const [users, setUsers] = useState<PlatformUser[] | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [disableTarget, setDisableTarget] = useState<PlatformUser | null>(null);

  async function load() {
    try {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      if (role) qs.set("role", role);
      setUsers(await apiFetch<PlatformUser[]>(`/platform/users?${qs.toString()}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load users.");
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platform</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every staff account, across every organization.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[220px] flex-1">
          <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" />
        </div>
        <div className="min-w-[180px]">
          <Dropdown
            label="Role"
            value={role}
            onChange={setRole}
            options={[{ value: "", label: "All roles" }, ...ROLE_OPTIONS.map((r) => ({ value: r, label: r }))]}
          />
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Organization / Institute</th>
              <th className="px-4 py-2.5">2FA</th>
              <th className="px-4 py-2.5">Last login</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users === null &&
              Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={6}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
            {users?.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{u.fullName}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.role}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {u.organizationName ?? "—"}
                  {u.instituteName && <span className="block text-xs">{u.instituteName}</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.mfaEnabled ? "success" : "neutral"}>{u.mfaEnabled ? "Enabled" : "Off"}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.lastLoginAt ? formatDate(u.lastLoginAt, { year: false }) : "Never"}</td>
                <td className="px-4 py-3 text-right">
                  {u.mfaEnabled && (
                    <button
                      type="button"
                      onClick={() => setDisableTarget(u)}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Disable 2FA
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users && users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No users match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 sm:hidden">
        {users?.map((u) => (
          <div key={u.id} className="rounded-xl border border-border bg-card p-4">
            <p className="font-medium text-foreground">{u.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {u.email} · {u.role}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {u.organizationName ?? "—"}
              {u.instituteName && ` · ${u.instituteName}`}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <Badge tone={u.mfaEnabled ? "success" : "neutral"}>{u.mfaEnabled ? "2FA on" : "2FA off"}</Badge>
              {u.mfaEnabled && (
                <button type="button" onClick={() => setDisableTarget(u)} className="text-xs font-medium text-muted-foreground hover:underline">
                  Disable 2FA
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <DisableMfaModal target={disableTarget} onClose={() => setDisableTarget(null)} onDisabled={load} />
    </div>
  );
}

function DisableMfaModal({
  target,
  onClose,
  onDisabled,
}: {
  target: PlatformUser | null;
  onClose: () => void;
  onDisabled: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setReason("");
    setError(null);
    onClose();
  }

  async function handleConfirm() {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/platform/users/${target.id}/mfa/disable`, { method: "POST", body: JSON.stringify({ reason }) });
      onDisabled();
      handleClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not disable two-factor authentication.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={handleClose}
      title={`Disable two-factor authentication for ${target?.fullName ?? "this user"}?`}
      description="The genuine 'lost my phone and my backup codes' case — this is their only recovery path. Requires a reason, since it's a real attack surface on its own."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting || !reason.trim()}>
            {submitting ? "Disabling…" : "Disable 2FA"}
          </Button>
        </>
      }
    >
      <label className="mb-1.5 block text-sm font-medium text-foreground">Reason</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="Why is 2FA being disabled? Recorded in the audit log."
        className="w-full resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {error && <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
    </Modal>
  );
}
