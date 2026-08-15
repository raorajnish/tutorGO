"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AddInstituteModal } from "./AddInstituteModal";
import { AddOwnerModal } from "./AddOwnerModal";
import { InviteResultPanel } from "./InviteResultPanel";
import type { InviteResult, OrganizationDetail } from "@/lib/types";

interface Props {
  organizationId: string | null;
  onClose: () => void;
}

export function OrganizationDetailModal({ organizationId, onClose }: Props) {
  const router = useRouter();
  const [org, setOrg] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addInstituteOpen, setAddInstituteOpen] = useState(false);
  const [addOwnerOpen, setAddOwnerOpen] = useState(false);
  const [resendResult, setResendResult] = useState<InviteResult | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  function load() {
    if (!organizationId) return;
    apiFetch<OrganizationDetail>(`/platform/organizations/${organizationId}`)
      .then(setOrg)
      .catch(() => setError("Could not load this organization."));
  }

  useEffect(() => {
    setOrg(null);
    setResendResult(null);
    setResendError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function resendInvite() {
    if (!organizationId) return;
    setResending(true);
    setResendError(null);
    try {
      const res = await apiFetch<InviteResult>(`/platform/organizations/${organizationId}/resend-invite`, {
        method: "POST",
      });
      setResendResult(res);
    } catch (err) {
      setResendError(err instanceof ApiClientError ? err.message : "Failed to resend.");
    } finally {
      setResending(false);
    }
  }

  function goToInstitute(instituteId: string) {
    if (!organizationId) return;
    router.push(`/platform/organizations/${organizationId}/institutes/${instituteId}`);
    onClose();
  }

  return (
    <>
      <Modal open={!!organizationId} onClose={onClose} title={org?.name ?? "Organization"} description={org?.code} width="lg">
        {error && <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

        {org && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => setAddInstituteOpen(true)}>Add institute</Button>
              {org.owner ? (
                <Button variant="secondary" onClick={resendInvite} disabled={resending}>
                  {resending ? "Resending…" : "Resend invite"}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => setAddOwnerOpen(true)}>
                  Add owner
                </Button>
              )}
              {resendError && <span className="text-xs text-danger">{resendError}</span>}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Owner</p>
              {resendResult ? (
                <InviteResultPanel label="Owner" result={resendResult} />
              ) : org.owner ? (
                <div className="rounded-xl border border-border p-3.5 text-sm">
                  <p className="font-medium text-foreground">{org.owner.fullName}</p>
                  <p className="text-muted-foreground">{org.owner.email}</p>
                  {org.owner.mustChangePassword && <Badge tone="warning">Temp password</Badge>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No owner yet.</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">Institutes ({org.institutes.length})</p>
              <div className="divide-y divide-border rounded-xl border border-border">
                {org.institutes.map((inst) => (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => goToInstitute(inst.id)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-xs font-semibold text-secondary-foreground">
                      {inst.code.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{inst.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {inst.code} · {inst.admins.length} admin{inst.admins.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Badge tone={inst.isActive ? "success" : "danger"}>{inst.isActive ? "Active" : "Inactive"}</Badge>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground">
                      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                ))}
                {org.institutes.length === 0 && (
                  <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">No institutes yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {org && (
        <AddInstituteModal
          open={addInstituteOpen}
          onClose={() => setAddInstituteOpen(false)}
          onCreated={load}
          organizationId={org.id}
          organizationCode={org.code}
          organizationName={org.name}
          existingInstituteCount={org.institutes.length}
        />
      )}

      {org && (
        <AddOwnerModal
          open={addOwnerOpen}
          onClose={() => setAddOwnerOpen(false)}
          onAdded={load}
          organizationId={org.id}
          organizationName={org.name}
        />
      )}
    </>
  );
}
