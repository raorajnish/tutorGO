"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TEAM_ROLES, TEAM_ROLE_LABELS, type TeamMember, type TeamRole } from "@/lib/types";

export function TeamTab() {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    apiFetch<TeamMember[]>("/org/team")
      .then(setTeam)
      .catch(() => setError("Could not load your team."));
  }

  useEffect(load, []);

  async function toggleActive(member: TeamMember) {
    setBusyId(member.id);
    setError(null);
    try {
      await apiFetch(`/org/team/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !member.isActive }),
      });
      setTeam((prev) => prev?.map((m) => (m.id === member.id ? { ...m, isActive: !m.isActive } : m)) ?? null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this team member.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Admins, accountants, faculty and reception for this institute.</p>
        <Button onClick={() => setInviteOpen(true)}>Invite team member</Button>
      </div>

      {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {team?.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{m.fullName}</p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </td>
                <td className="px-4 py-3">
                  <Badge tone="primary">{TEAM_ROLE_LABELS[m.role]}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={m.isActive ? "success" : "danger"}>{m.isActive ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" disabled={busyId === m.id} onClick={() => toggleActive(m)}>
                    {m.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
            {team && team.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No team members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <InviteTeamModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={load} />
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
  const [result, setResult] = useState<{ emailDelivered: boolean; tempPassword?: string } | null>(null);

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
      const res = await apiFetch<{ emailDelivered: boolean; tempPassword?: string }>("/org/team", {
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
        <div className="space-y-3">
          {result.emailDelivered ? (
            <p className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">Invite email sent.</p>
          ) : (
            <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
              <p className="font-medium">Email delivery isn&apos;t configured.</p>
              <p className="mt-1">
                Temp password: <span className="font-mono font-semibold">{result.tempPassword}</span>
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={reset}>
              Invite another
            </Button>
            <Button onClick={handleClose}>Done</Button>
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
