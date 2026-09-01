"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { formatMoney, parseMoney } from "@/lib/money";
import { SALARY_TYPE_LABELS, type RateHistoryEntry, type SalaryProfileListItem } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

interface Props {
  profile: SalaryProfileListItem | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export function EditSalaryProfileModal({ profile, onClose, onSaved, onDeleted }: Props) {
  const [title, setTitle] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [rate, setRate] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [history, setHistory] = useState<RateHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const pending = profile ? parseMoney(profile.pendingAmount) : 0;
  const hasPaymentHistory = !!profile?.lastPaidOn;

  useEffect(() => {
    if (!profile) return;
    setTitle(profile.title ?? "");
    setExternalEmail(profile.externalEmail ?? "");
    setExternalPhone(profile.externalPhone ?? "");
    setRate(profile.salaryType === "FIXED" ? (profile.monthlyRate ?? "") : (profile.perLectureRate ?? ""));
    setIsActive(profile.isActive);
    setError(null);
    apiFetch<RateHistoryEntry[]>(`/payroll/staff/${profile.id}/rate-history`)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [profile]);

  async function save(overrides?: { isActive?: boolean }) {
    if (!profile) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch(`/payroll/staff/${profile.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title || null,
          ...(profile.isExternal ? { externalEmail: externalEmail || null, externalPhone: externalPhone || null } : {}),
          [profile.salaryType === "FIXED" ? "monthlyRate" : "perLectureRate"]: Number(rate),
          isActive: overrides?.isActive ?? isActive,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save changes.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleActiveToggle(next: boolean) {
    if (!next && pending > 0.005) {
      setDeactivateConfirmOpen(true);
      return;
    }
    setIsActive(next);
  }

  async function handleDelete() {
    if (!profile) return;
    try {
      await apiFetch(`/payroll/staff/${profile.id}`, { method: "DELETE" });
      onDeleted();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not delete this staff member.");
      throw err;
    }
  }

  return (
    <>
      <Modal
        open={profile !== null}
        onClose={onClose}
        title={profile ? `Edit — ${profile.name}` : "Edit"}
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => save()} disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        {profile && (
          <div className="space-y-4">
            <Input label="Title / role" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Caretaker" />
            {profile.isExternal && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input label="Email (optional)" type="email" value={externalEmail} onChange={(e) => setExternalEmail(e.target.value)} placeholder="For payment notifications" />
                <Input label="Phone (optional)" value={externalPhone} onChange={(e) => setExternalPhone(e.target.value)} />
              </div>
            )}
            <Input
              label={profile.salaryType === "FIXED" ? "Monthly rate (₹)" : "Rate per lecture (₹)"}
              type="number"
              min={0.01}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={isActive} onChange={(e) => handleActiveToggle(e.target.checked)} className="h-4 w-4 accent-accent" />
              Active on payroll
            </label>
            {!isActive && pending > 0.005 && (
              <p className="text-xs text-warning">Still owed {formatMoney(pending)} — deactivating drops them from future run previews/sweeps, but this balance stays visible and payable here.</p>
            )}

            {history.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rate history</p>
                <div className="max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-border p-2.5 text-xs">
                  {history.map((h) => (
                    <div key={h.id} className="text-muted-foreground">
                      {fmtDate(h.changedAt)} · {h.changedByName ?? "—"} — {formatMoney(h.from?.monthlyRate ?? h.from?.perLectureRate)} →{" "}
                      {formatMoney(h.to?.monthlyRate ?? h.to?.perLectureRate)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

            {!hasPaymentHistory && (
              <button type="button" onClick={() => setDeleteConfirmOpen(true)} className="text-xs font-medium text-danger underline underline-offset-2 hover:text-danger/80">
                Delete this salary profile
              </button>
            )}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={deactivateConfirmOpen}
        onClose={() => setDeactivateConfirmOpen(false)}
        onConfirm={() => {
          setIsActive(false);
          setDeactivateConfirmOpen(false);
        }}
        title="Deactivate with a balance still owed?"
        description={profile ? `${profile.name} is still owed ${formatMoney(pending)}. Deactivating won't clear it — it stays visible and payable from their ledger, but drops out of future run previews.` : undefined}
        confirmLabel="Deactivate anyway"
        destructive={false}
      />

      <ConfirmModal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title={`Delete ${SALARY_TYPE_LABELS[profile?.salaryType ?? "FIXED"]} profile for ${profile?.name ?? "this staff member"}?`}
        description="Only possible because they have no payment history. This can't be undone — use Deactivate instead if you're not sure."
        confirmLabel="Delete"
      />
    </>
  );
}
