"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { apiFetch, apiDownload, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  CAPPED_ROLES,
  CAPPED_ROLE_LABELS,
  MODULE_CODES,
  MODULE_LABELS,
  type CappedRole,
  type InstituteSuspension,
  type ModuleCode,
  type PlanLimits,
  type PlatformInstituteDetail,
  type RoleLimitValues,
} from "@/lib/types";
import { formatDate } from "@/lib/format";

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
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [logoutTarget, setLogoutTarget] = useState<{ id: string; fullName: string } | null>(null);

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

  async function setSuspended(isActive: boolean, reason?: string) {
    setSuspending(true);
    setError(null);
    try {
      await apiFetch(`/platform/organizations/${orgId}/institutes/${instituteId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive, reason }),
      });
      setSuspendOpen(false);
      load();
      loadSuspensions();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this institute.");
    } finally {
      setSuspending(false);
    }
  }

  const [suspensions, setSuspensions] = useState<InstituteSuspension[] | null>(null);

  function loadSuspensions() {
    apiFetch<InstituteSuspension[]>(`/platform/institutes/${instituteId}/suspensions`)
      .then(setSuspensions)
      .catch(() => setSuspensions([]));
  }

  useEffect(loadSuspensions, [instituteId]);

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await apiDownload(`/platform/institutes/${instituteId}/export`, `institute-export-${detail?.code ?? instituteId}.zip`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not export this institute's data.");
    } finally {
      setExporting(false);
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
                <TeamList title="Admins" members={detail.admins} onLogoutEverywhere={setLogoutTarget} />
                <TeamList title="Accountants" members={detail.accountants} onLogoutEverywhere={setLogoutTarget} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="font-display text-base font-semibold text-foreground">Plan</p>
                {detail.customised && <Badge tone="warning">Customised</Badge>}
              </div>

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

              {/* The single most important thing to say on this screen: the
                  numbers below belong to THIS institute, not to the plan. */}
              <p className="mt-2 text-xs text-muted-foreground">
                Choosing a plan copies its limits here. Editing the plan later won&apos;t change this institute.
              </p>

              {detail.limits ? (
                <>
                  <ul className="mt-4 space-y-2">
                    {CAPPED_ROLES.map((role) => {
                      const limit = detail.limits![role];
                      const atLimit = limit.used >= limit.max;
                      const planMax = detail.plan?.limits[role];
                      const raised = planMax !== undefined && limit.max !== planMax;
                      return (
                        <li key={role} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">{CAPPED_ROLE_LABELS[role]}</span>
                          <span className="flex items-baseline gap-1.5">
                            {raised && (
                              <span className="text-xs text-muted-foreground line-through">{planMax}</span>
                            )}
                            <span className={atLimit ? "font-medium text-warning" : "text-foreground"}>
                              {limit.used} / {limit.max}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <Button variant="secondary" className="mt-4 w-full" onClick={() => setLimitsOpen(true)}>
                    Edit limits for this institute
                  </Button>

                  {detail.planLimitsSetAt && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      Set {formatDate(detail.planLimitsSetAt)}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">No plan assigned — headcount is unlimited.</p>
              )}
            </div>

            {/* Suspension is the only way to take an institute out of service:
                its fee, payroll and attendance history has to stay auditable,
                so there is no delete anywhere in the platform. */}
            <div className="rounded-3xl border border-border bg-card p-6">
              <p className="font-display text-base font-semibold text-foreground">Access</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {detail.isActive
                  ? "Everyone at this institute can sign in and work normally."
                  : "Suspended — nobody at this institute can sign in, and existing sessions are rejected. All data is retained."}
              </p>
              <Button
                variant={detail.isActive ? "destructive" : "primary"}
                className="mt-4 w-full"
                disabled={suspending}
                onClick={() => (detail.isActive ? setSuspendOpen(true) : setSuspended(true))}
              >
                {detail.isActive ? "Suspend institute" : "Reactivate institute"}
              </Button>

              {/* changes-phase14.md §14.2 — the support/offboarding case: a
                  copy of this institute's data before it's suspended or
                  wound down. Same bundle as the owner's own Settings export. */}
              <Button variant="secondary" className="mt-2 w-full" disabled={exporting} onClick={handleExport}>
                {exporting && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                    <path d="M21 12a9 9 0 11-9-9" strokeLinecap="round" />
                  </svg>
                )}
                {exporting ? "Preparing export…" : "Export institute data"}
              </Button>

              {suspensions && suspensions.length > 0 && (
                <div className="mt-5 border-t border-border pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suspension history</p>
                  <ul className="space-y-2.5">
                    {suspensions.map((s) => (
                      <li key={s.id} className="rounded-lg border border-border px-3 py-2.5 text-sm">
                        <p className="text-foreground">{s.reason}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Suspended by {s.suspendedBy.fullName} on {formatDate(s.suspendedAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {s.liftedAt
                            ? `Lifted by ${s.liftedBy?.fullName ?? "—"} on ${formatDate(s.liftedAt)}`
                            : "Still in effect"}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
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

      {detail?.limits && (
        <EditLimitsModal
          open={limitsOpen}
          onClose={() => setLimitsOpen(false)}
          onSaved={load}
          instituteId={instituteId}
          instituteName={detail.name}
          limits={detail.limits}
          planName={detail.plan?.name ?? null}
          planLimits={detail.plan?.limits ?? null}
        />
      )}

      <SuspendModal
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        onConfirm={(reason) => setSuspended(false, reason)}
        instituteName={detail?.name ?? "this institute"}
        submitting={suspending}
      />

      <ConfirmModal
        open={!!logoutTarget}
        onClose={() => setLogoutTarget(null)}
        onConfirm={async () => {
          await apiFetch(`/platform/users/${logoutTarget!.id}/logout-everywhere`, { method: "POST" });
        }}
        title={`Sign out ${logoutTarget?.fullName ?? "this user"} everywhere?`}
        confirmLabel="Sign out everywhere"
        destructive
        description="Every session on this account is signed out immediately, on their next request. Their account and data are untouched — they can sign back in right away."
      />
    </div>
  );
}

/** Suspending requires a reason (changes-phase12.md §12.10) — ConfirmModal
 * has no field slot for one, so this is its own small modal rather than a
 * shoehorned prop onto that shared component. */
function SuspendModal({
  open,
  onClose,
  onConfirm,
  instituteName,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  instituteName: string;
  submitting: boolean;
}) {
  const [reason, setReason] = useState("");

  function handleClose() {
    setReason("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Suspend ${instituteName}?`}
      description="Everyone at this institute is signed out immediately and cannot sign back in. Fees, payroll, attendance and every other record are kept intact, and you can reactivate at any time."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onConfirm(reason)} disabled={submitting || !reason.trim()}>
            {submitting ? "Suspending…" : "Suspend"}
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
        placeholder="Why is this institute being suspended? Shown in its suspension history."
        className="w-full resize-none rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </Modal>
  );
}

/** Raises or lowers one institute's caps without touching the shared plan —
 * the "this one customer needs 40 faculty" case. Pre-filled with what's
 * currently enforced, with the plan's own numbers shown alongside so it's
 * obvious what's being departed from. */
function EditLimitsModal({
  open,
  onClose,
  onSaved,
  instituteId,
  instituteName,
  limits,
  planName,
  planLimits,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  instituteId: string;
  instituteName: string;
  limits: PlanLimits;
  planName: string | null;
  planLimits: RoleLimitValues | null;
}) {
  const [values, setValues] = useState<Record<CappedRole, string>>(() =>
    Object.fromEntries(CAPPED_ROLES.map((r) => [r, String(limits[r].max)])) as Record<CappedRole, string>
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the modal is reopened, so a cancelled edit doesn't linger.
  useEffect(() => {
    if (open) {
      setValues(
        Object.fromEntries(CAPPED_ROLES.map((r) => [r, String(limits[r].max)])) as Record<CappedRole, string>
      );
      setError(null);
    }
  }, [open, limits]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/platform/institutes/${instituteId}/limits`, {
        method: "PATCH",
        body: JSON.stringify({
          maxAdmins: Number(values.ADMIN),
          maxAccountants: Number(values.ACCOUNTANT),
          maxFaculty: Number(values.FACULTY),
          maxReception: Number(values.RECEPTION),
          maxStudents: Number(values.STUDENT),
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the limits.");
    } finally {
      setSaving(false);
    }
  }

  const invalid = CAPPED_ROLES.some((r) => {
    const n = Number(values[r]);
    return values[r].trim() === "" || !Number.isInteger(n) || n < 0;
  });

  return (
    <Modal open={open} onClose={onClose} title={`Limits — ${instituteName}`}>
      <p className="text-sm text-muted-foreground">
        Applies to this institute only. {planName ? `The ${planName} plan and every other institute on it stay unchanged.` : ""}
      </p>

      <div className="mt-4 space-y-3">
        {CAPPED_ROLES.map((role) => {
          const used = limits[role].used;
          const planMax = planLimits?.[role];
          const next = Number(values[role]);
          const belowUsage = Number.isFinite(next) && values[role].trim() !== "" && next < used;
          return (
            <div key={role}>
              <Input
                label={CAPPED_ROLE_LABELS[role]}
                type="number"
                min={0}
                value={values[role]}
                onChange={(e) => setValues((prev) => ({ ...prev, [role]: e.target.value }))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {used} in use{planMax !== undefined ? ` · plan allows ${planMax}` : ""}
                {belowUsage && (
                  <span className="text-warning">
                    {" "}
                    — below current usage; existing accounts keep working, no new ones can be added.
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving || invalid}>
          {saving ? "Saving…" : "Save limits"}
        </Button>
      </div>
    </Modal>
  );
}

function TeamList({
  title,
  members,
  onLogoutEverywhere,
}: {
  title: string;
  members: PlatformInstituteDetail["admins"];
  onLogoutEverywhere: (member: { id: string; fullName: string }) => void;
}) {
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
              <div className="flex items-center gap-3">
                <Badge tone={m.isActive ? "success" : "danger"}>{m.isActive ? "Active" : "Inactive"}</Badge>
                {m.isActive && (
                  <button
                    type="button"
                    onClick={() => onLogoutEverywhere({ id: m.id, fullName: m.fullName })}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Sign out everywhere
                  </button>
                )}
              </div>
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
