"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import {
  CAPPED_ROLES,
  CAPPED_ROLE_LABELS,
  MODULE_CODES,
  MODULE_LABELS,
  type ModuleCode,
  type PlatformInstituteDetail,
} from "@/lib/types";

interface PageProps {
  params: Promise<{ orgId: string; instituteId: string }>;
}

export default function PlatformInstituteDetailPage({ params }: PageProps) {
  const { orgId, instituteId } = usePromise(params);

  const [detail, setDetail] = useState<PlatformInstituteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyModule, setBusyModule] = useState<ModuleCode | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  function load() {
    apiFetch<PlatformInstituteDetail>(`/platform/organizations/${orgId}/institutes/${instituteId}`)
      .then(setDetail)
      .catch(() => setError("Could not load this institute."));
  }

  useEffect(load, [orgId, instituteId]);

  async function toggleModule(code: ModuleCode, isActive: boolean) {
    setBusyModule(code);
    setError(null);
    try {
      await apiFetch(`/platform/institutes/${instituteId}/toggle-module`, {
        method: "POST",
        body: JSON.stringify({ moduleCode: code, isActive }),
      });
      setDetail((prev) => (prev ? { ...prev, modules: prev.modules.map((m) => (m.code === code ? { ...m, isActive } : m)) } : prev));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the module.");
    } finally {
      setBusyModule(null);
    }
  }

  async function changePlan(planId: string) {
    setSavingPlan(true);
    setError(null);
    try {
      await apiFetch(`/platform/institutes/${instituteId}/plan`, {
        method: "PATCH",
        body: JSON.stringify({ planId: planId || null }),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the plan.");
    } finally {
      setSavingPlan(false);
    }
  }

  const activeByCode = new Map(detail?.modules.map((m) => [m.code, m.isActive]) ?? []);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/platform/organizations" className="text-sm font-medium text-accent hover:opacity-80">
          ← Organizations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold text-foreground">{detail?.name ?? "Institute"}</h1>
          {detail && <Badge tone={detail.isActive ? "success" : "danger"}>{detail.isActive ? "Active" : "Inactive"}</Badge>}
        </div>
        {detail && <p className="mt-1 text-sm text-muted-foreground">{detail.code}{detail.city ? ` · ${detail.city}` : ""}</p>}
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      {detail && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-3xl border border-border bg-card p-6">
              <p className="mb-3 font-display text-base font-semibold text-foreground">Modules</p>
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

            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center justify-between">
                <p className="font-display text-base font-semibold text-foreground">Team</p>
                <Button variant="secondary" onClick={() => setInviteOpen(true)}>
                  Invite admin
                </Button>
              </div>

              <div className="mt-4 space-y-4">
                <TeamList title="Admins" members={detail.admins} />
                <TeamList title="Accountants" members={detail.accountants} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6">
              <p className="mb-3 font-display text-base font-semibold text-foreground">Plan</p>
              <Dropdown
                value={detail.plan?.id ?? ""}
                onChange={changePlan}
                disabled={savingPlan}
                placeholder="No plan (unlimited)"
                options={[
                  { value: "", label: "No plan (unlimited)" },
                  ...detail.availablePlans.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />

              {detail.plan && (
                <ul className="mt-4 space-y-2">
                  {CAPPED_ROLES.map((role) => {
                    const limit = detail.plan!.limits[role];
                    const atLimit = limit.used >= limit.max;
                    return (
                      <li key={role} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{CAPPED_ROLE_LABELS[role]}</span>
                        <span className={atLimit ? "font-medium text-warning" : "text-foreground"}>
                          {limit.used} / {limit.max}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <InviteAdminModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={load}
        orgId={orgId}
        instituteId={instituteId}
        instituteName={detail?.name ?? ""}
      />
    </div>
  );
}

function TeamList({ title, members }: { title: string; members: PlatformInstituteDetail["admins"] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-xl border border-border px-3.5 py-2.5 text-sm">
              <div>
                <p className="font-medium text-foreground">{m.fullName}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <Badge tone={m.isActive ? "success" : "danger"}>{m.isActive ? "Active" : "Inactive"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteAdminModal({
  open,
  onClose,
  onInvited,
  orgId,
  instituteId,
  instituteName,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
  orgId: string;
  instituteId: string;
  instituteName: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ emailDelivered: boolean; tempPassword?: string } | null>(null);

  function handleClose() {
    setName("");
    setEmail("");
    setPhone("");
    setError(null);
    setResult(null);
    onClose();
  }

  async function handleSubmit() {
    if (!name.trim() || !email.trim()) return setError("Name and email are required.");
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ emailDelivered: boolean; tempPassword?: string }>(
        `/platform/organizations/${orgId}/institutes/${instituteId}/admins`,
        { method: "POST", body: JSON.stringify({ name, email, phone: phone || undefined }) }
      );
      setResult(res);
      onInvited();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not invite the admin.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal open={open} onClose={handleClose} title="Admin invited" width="sm">
        <div className="space-y-3 text-sm">
          {result.emailDelivered ? (
            <p className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-success">Invite email sent.</p>
          ) : (
            <div className="rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-warning">
              <p className="font-medium">Email delivery isn&apos;t configured.</p>
              <p className="mt-1">
                Temp password: <span className="font-mono font-semibold">{result.tempPassword}</span>
              </p>
            </div>
          )}
          <Button className="w-full" onClick={handleClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Invite admin"
      description={instituteName}
      width="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Inviting…" : "Invite admin"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </div>
    </Modal>
  );
}
