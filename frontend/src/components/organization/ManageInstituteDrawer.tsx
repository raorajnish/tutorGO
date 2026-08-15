"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import {
  CAPPED_ROLES,
  CAPPED_ROLE_LABELS,
  MODULE_CODES,
  MODULE_LABELS,
  type CappedRole,
  type InstituteDetail,
  type ModuleCode,
  type StaffMember,
} from "@/lib/types";

interface Props {
  instituteId: string | null;
  onClose: () => void;
}

type InviteResult = { emailDelivered: boolean; tempPassword?: string };

function PlanUsage({ detail }: { detail: InstituteDetail }) {
  if (!detail.plan) {
    return <p className="text-sm text-muted-foreground">No plan assigned — headcount is unlimited.</p>;
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Plan</p>
        <Badge tone="primary">{detail.plan.name}</Badge>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CAPPED_ROLES.map((role) => {
          const limit = detail.plan!.limits[role];
          const atLimit = limit.used >= limit.max;
          return (
            <li key={role} className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">{CAPPED_ROLE_LABELS[role]}</p>
              <p className={`text-sm font-semibold ${atLimit ? "text-warning" : "text-foreground"}`}>
                {limit.used} / {limit.max}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StaffSection({
  instituteId,
  role,
  members,
  atLimit,
  onInvited,
}: {
  instituteId: string;
  role: Extract<CappedRole, "ADMIN" | "ACCOUNTANT">;
  members: StaffMember[];
  atLimit: boolean;
  onInvited: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResult | null>(null);

  const endpoint = role === "ADMIN" ? "admins" : "accountants";
  const label = role === "ADMIN" ? "admin" : "accountant";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      const res = await apiFetch<Record<string, unknown> & InviteResult>(
        `/organization/institutes/${instituteId}/${endpoint}`,
        {
          method: "POST",
          body: JSON.stringify({ fullName: name, email, phone: phone || undefined }),
        }
      );
      setResult(res);
      setName("");
      setEmail("");
      setPhone("");
      onInvited();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : `Could not invite the ${label}.`);
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="border-t border-border pt-5">
      <p className="mb-2 text-sm font-medium text-foreground">{CAPPED_ROLE_LABELS[role]}</p>
      {members.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-foreground">{m.fullName}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <Badge tone={m.isActive ? "success" : "danger"}>{m.isActive ? "Active" : "Inactive"}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">No {label}s invited yet.</p>
      )}

      {error && <div className="mb-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      {result ? (
        <div className="rounded-md border border-border p-3 text-sm">
          {result.emailDelivered ? (
            <p className="text-success">Invite email sent.</p>
          ) : (
            <div className="text-warning">
              <p className="font-medium">Email delivery isn&apos;t configured.</p>
              <p className="mt-1">
                Temp password: <span className="font-mono font-semibold">{result.tempPassword}</span>
              </p>
            </div>
          )}
          <Button variant="ghost" className="mt-2" onClick={() => setResult(null)}>
            Invite another
          </Button>
        </div>
      ) : atLimit ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          This institute&apos;s plan has reached its {label} limit. Upgrade the plan to invite more.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button type="submit" disabled={inviting}>
            {inviting ? "Inviting…" : `Invite ${label}`}
          </Button>
        </form>
      )}
    </div>
  );
}

export function ManageInstituteDrawer({ instituteId, onClose }: Props) {
  const [detail, setDetail] = useState<InstituteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyModule, setBusyModule] = useState<ModuleCode | null>(null);

  function load() {
    if (!instituteId) return;
    apiFetch<InstituteDetail>(`/organization/institutes/${instituteId}`)
      .then(setDetail)
      .catch(() => setError("Could not load institute details."));
  }

  useEffect(() => {
    setDetail(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instituteId]);

  async function toggleModule(code: ModuleCode, isActive: boolean) {
    if (!instituteId) return;
    setBusyModule(code);
    setError(null);
    try {
      await apiFetch(`/organization/institutes/${instituteId}/toggle-module`, {
        method: "POST",
        body: JSON.stringify({ moduleCode: code, isActive }),
      });
      setDetail((prev) =>
        prev ? { ...prev, modules: prev.modules.map((m) => (m.code === code ? { ...m, isActive } : m)) } : prev
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the module.");
    } finally {
      setBusyModule(null);
    }
  }

  const activeByCode = new Map(detail?.modules.map((m) => [m.code, m.isActive]) ?? []);

  return (
    <Modal open={!!instituteId} onClose={onClose} title={detail ? detail.name : "Institute"} description={detail?.code} width="lg">
      {error && <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      {detail && (
        <div className="space-y-6">
          <PlanUsage detail={detail} />

          <div className="border-t border-border pt-5">
            <p className="mb-2 text-sm font-medium text-foreground">Modules</p>
            <ul className="space-y-2">
              {MODULE_CODES.map((code) => {
                const isActive = activeByCode.get(code) ?? false;
                return (
                  <li key={code} className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5">
                    <span className="text-sm font-medium text-foreground">{MODULE_LABELS[code]}</span>
                    <Toggle
                      checked={isActive}
                      disabled={busyModule === code}
                      onChange={(next) => toggleModule(code, next)}
                      label={MODULE_LABELS[code]}
                    />
                  </li>
                );
              })}
            </ul>
          </div>

          <StaffSection
            instituteId={detail.id}
            role="ADMIN"
            members={detail.admins}
            atLimit={!!detail.plan && detail.plan.limits.ADMIN.used >= detail.plan.limits.ADMIN.max}
            onInvited={load}
          />

          <StaffSection
            instituteId={detail.id}
            role="ACCOUNTANT"
            members={detail.accountants}
            atLimit={!!detail.plan && detail.plan.limits.ACCOUNTANT.used >= detail.plan.limits.ACCOUNTANT.max}
            onInvited={load}
          />
        </div>
      )}
    </Modal>
  );
}
