"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FacultyAssignmentModal } from "@/components/settings/FacultyAssignmentModal";
import { SendReminderModal } from "@/components/settings/SendReminderModal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { ImportButton } from "@/components/ui/ImportButton";
import { ImportModal } from "@/components/ui/ImportModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { CopyButton } from "@/components/ui/CopyButton";
import { useAuth } from "@/lib/auth-context";
import { TEAM_ROLES, TEAM_ROLE_LABELS, type TeamMember, type TeamRole } from "@/lib/types";

export function TeamTab() {
  const { user: currentUser } = useAuth();
  const canManage = currentUser?.role === "OWNER" || currentUser?.role === "ADMIN";
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmMember, setConfirmMember] = useState<TeamMember | null>(null);

  function loadTeam() {
    setError(null);
    apiFetch<TeamMember[]>("/org/team")
      .then(setTeam)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : "Could not load the team directory."));
  }

  useEffect(() => {
    loadTeam();
  }, []);

  async function handleToggleStatus(m: TeamMember) {
    setBusyId(m.id);
    try {
      await apiFetch(`/org/team/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      loadTeam();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">{error}</div>}

      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">Team directory</h2>
          <p className="text-sm text-muted-foreground">Staff accounts with login access to this institute.</p>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <ImportButton onClick={() => setImportOpen(true)} title="Bulk import team members from CSV" />
            <Button variant="secondary" onClick={() => setReminderOpen(true)}>
              Send reminder
            </Button>
            <Button onClick={() => setInviteOpen(true)}>Invite team member</Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Desktop Table View */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-[30%] px-4 py-3 font-medium">Name</th>
                <th className="w-[20%] px-4 py-3 font-medium">Role</th>
                <th className="w-[20%] px-4 py-3 font-medium">Phone</th>
                <th className="w-[15%] px-4 py-3 font-medium">Status</th>
                {canManage && <th className="w-[15%] px-4 py-3 text-right font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {team === null &&
                Array.from({ length: 4 }, (_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={canManage ? 5 : 4} className="px-4 py-3">
                      <SkeletonRow lines={2} />
                    </td>
                  </tr>
                ))}
              {team?.map((m) => (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{m.fullName}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={m.role === "ADMIN" ? "accent" : "primary"}>
                      {TEAM_ROLE_LABELS[m.role as TeamRole] ?? m.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={m.isActive ? "success" : "danger"}>{m.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {m.id !== currentUser?.id && (
                        <Button
                          variant={m.isActive ? "destructive" : "secondary"}
                          disabled={busyId === m.id}
                          onClick={() => setConfirmMember(m)}
                          className="text-xs"
                        >
                          {m.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      )}
                      {m.id === currentUser?.id && <span className="text-xs text-muted-foreground">You</span>}
                    </td>
                  )}
                </tr>
              ))}
              {team && team.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-8">
                    <EmptyState
                      message="No team members found."
                      actionLabel={canManage ? "Invite team member" : undefined}
                      onAction={canManage ? () => setInviteOpen(true) : undefined}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="divide-y divide-border sm:hidden">
          {team === null &&
            Array.from({ length: 4 }, (_, i) => (
              <div key={`sk-mob-${i}`} className="p-4">
                <SkeletonRow lines={2} />
              </div>
            ))}
          {team?.map((m) => (
            <div key={m.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{m.fullName}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  {m.phone && <p className="mt-0.5 text-xs text-muted-foreground">Phone: {m.phone}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge tone={m.role === "ADMIN" ? "accent" : "primary"}>
                    {TEAM_ROLE_LABELS[m.role as TeamRole] ?? m.role}
                  </Badge>
                  <Badge tone={m.isActive ? "success" : "danger"}>{m.isActive ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
              {canManage && m.id !== currentUser?.id && (
                <div className="flex justify-end pt-1">
                  <Button
                    variant={m.isActive ? "destructive" : "secondary"}
                    disabled={busyId === m.id}
                    onClick={() => setConfirmMember(m)}
                    className="w-full text-xs"
                  >
                    {m.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {team && team.length === 0 && (
            <div className="p-6">
              <EmptyState
                message="No team members found."
                actionLabel={canManage ? "Invite team member" : undefined}
                onAction={canManage ? () => setInviteOpen(true) : undefined}
              />
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <>
          <InviteTeamModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={loadTeam} />
          <ImportModal
            open={importOpen}
            onClose={() => setImportOpen(false)}
            title="Import team members"
            description="Upload a CSV to invite many staff accounts at once."
            templatePath="/org/team/import/template.csv"
            templateFilename="team-import-template.csv"
            importPath="/org/team/import"
            onImported={loadTeam}
            extraColumnLabel="Temp password"
            extraColumnValue={(row) => (typeof row.tempPassword === "string" ? row.tempPassword : "")}
          />
          <SendReminderModal open={reminderOpen} onClose={() => setReminderOpen(false)} />
          {confirmMember && (
            <ConfirmModal
              open={!!confirmMember}
              onClose={() => setConfirmMember(null)}
              onConfirm={() => handleToggleStatus(confirmMember)}
              title={confirmMember.isActive ? `Deactivate ${confirmMember.fullName}?` : `Reactivate ${confirmMember.fullName}?`}
              description={
                confirmMember.isActive
                  ? `This will disable login access for ${confirmMember.fullName} (${confirmMember.email}). Their activity history will be preserved.`
                  : `This will restore login access for ${confirmMember.fullName} (${confirmMember.email}).`
              }
              confirmLabel={confirmMember.isActive ? "Deactivate member" : "Reactivate member"}
              destructive={confirmMember.isActive}
              note={
                confirmMember.isActive
                  ? "You can reactivate this account at any time."
                  : "They will be able to log in with their credentials again."
              }
            />
          )}
        </>
      )}
    </div>
  );
}

function InviteTeamModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<TeamRole>("FACULTY");
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState<{ emailDelivered: boolean; tempPassword?: string; loginUrl?: string } | null>(null);

  function reset() {
    setName("");
    setEmail("");
    setPhone("");
    setRole("FACULTY");
    setError(null);
    setResult(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    try {
      const res = await apiFetch<{ emailDelivered: boolean; tempPassword?: string; loginUrl?: string }>("/org/team", {
        method: "POST",
        body: JSON.stringify({ fullName: name, email, phone: phone || undefined, role }),
      });
      setResult(res);
      onInvited();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not invite this team member.");
    } finally {
      setInviting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Invite team member" description="They'll get an email with a temporary password.">
      {result ? (
        <div className="space-y-4">
          {result.emailDelivered ? (
            <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft p-3 text-sm font-medium text-success">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Invite email sent successfully.</span>
            </div>
          ) : (
            <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm font-medium text-warning">
              Email delivery isn&apos;t configured. Credentials and login link are provided below.
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-border bg-card p-3.5">
            {/* Email */}
            <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="truncate font-mono text-sm font-semibold text-foreground">{email}</p>
              </div>
              <CopyButton text={email} label="Copy email" />
            </div>

            {/* Temp Password */}
            {result.tempPassword && (
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Temporary Password</p>
                  <p className="font-mono text-sm font-bold text-foreground">{result.tempPassword}</p>
                </div>
                <CopyButton text={result.tempPassword} label="Copy password" />
              </div>
            )}

            {/* Login Link */}
            {(() => {
              const url =
                result.loginUrl ||
                (typeof window !== "undefined"
                  ? `${window.location.origin}/login?email=${encodeURIComponent(email)}`
                  : `/login?email=${encodeURIComponent(email)}`);
              return (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Login Link</p>
                    <p className="truncate font-mono text-xs text-foreground" title={url}>
                      {url}
                    </p>
                  </div>
                  <CopyButton text={url} label="Copy link" />
                </div>
              );
            })()}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {(() => {
              const url =
                result.loginUrl ||
                (typeof window !== "undefined"
                  ? `${window.location.origin}/login?email=${encodeURIComponent(email)}`
                  : `/login?email=${encodeURIComponent(email)}`);
              const fullText = `TutorGO Team Invite\nEmail: ${email}\nPassword: ${result.tempPassword ?? ""}\nLogin URL: ${url}`;
              return <CopyButton text={fullText} label="Copy all" variant="outline" />;
            })()}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={reset}>
                Invite another
              </Button>
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Role</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TEAM_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    role === r ? "border-primary bg-secondary text-secondary-foreground" : "border-border text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {TEAM_ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

          {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

          <Button type="submit" disabled={inviting} className="w-full">
            {inviting ? "Inviting…" : `Invite ${TEAM_ROLE_LABELS[role]}`}
          </Button>
        </form>
      )}
    </Modal>
  );
}
