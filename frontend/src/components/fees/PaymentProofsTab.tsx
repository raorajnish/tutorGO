"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { formatDateTime } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { ApprovePaymentProofResult, StaffPaymentProof } from "@/lib/types";

const STATUS_TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "danger" } as const;

const FILTERS = [
  { id: "PENDING", label: "Pending" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "", label: "All" },
] as const;

/** Approve/reject sheet — opened per-proof so staff always see the screenshot
 * at full size before deciding, rather than acting from a thumbnail in a list. */
function ReviewModal({
  proof,
  onClose,
  onDone,
}: {
  proof: StaffPaymentProof | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"UPI" | "CASH" | "CARD" | "BANK_TRANSFER" | "CHEQUE">("UPI");
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (proof) {
      setAmount(proof.amountClaimed);
      setRejectReason("");
      setShowReject(false);
      setError(null);
    }
  }, [proof]);

  async function handleApprove() {
    if (!proof) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch<ApprovePaymentProofResult>(`/fees/payment-proofs/${proof.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ amount: Number(amount), mode }),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not approve this payment.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    if (!proof) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/fees/payment-proofs/${proof.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason }),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reject this payment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={proof !== null}
      onClose={onClose}
      title={proof ? `Review payment — ${proof.student.name}` : ""}
      description={proof ? `Claimed ₹${proof.amountClaimed} · ${formatDateTime(proof.submittedAt)}` : undefined}
      width="md"
      footer={
        proof?.status === "PENDING" ? (
          showReject ? (
            <>
              <Button variant="secondary" onClick={() => setShowReject(false)} disabled={busy}>
                Back
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={busy || !rejectReason.trim()}>
                {busy ? "Rejecting…" : "Reject"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="destructive" onClick={() => setShowReject(true)} disabled={busy}>
                Reject
              </Button>
              <Button onClick={handleApprove} disabled={busy || !amount || Number(amount) <= 0}>
                {busy ? "Approving…" : "Approve & record payment"}
              </Button>
            </>
          )
        ) : undefined
      }
    >
      {proof && (
        <div className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proof.assetUrl}
            alt="Payment screenshot"
            className="mx-auto max-h-96 w-full rounded-xl border border-border object-contain"
          />

          {proof.referenceNo && (
            <p className="text-sm text-muted-foreground">
              Reference/UTR: <span className="font-medium text-foreground">{proof.referenceNo}</span>
            </p>
          )}

          {proof.status === "PENDING" && !showReject && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Amount to record"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Mode</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                  className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="UPI">UPI</option>
                  <option value="CASH">Cash</option>
                  <option value="CARD">Card</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </label>
            </div>
          )}

          {proof.status === "PENDING" && showReject && (
            <Textarea
              label="Reason for rejection"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="The student sees this reason and can resubmit."
            />
          )}

          {proof.status === "REJECTED" && proof.rejectReason && (
            <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">Rejected: {proof.rejectReason}</p>
          )}
          {proof.status === "APPROVED" && (
            <p className="rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">
              Approved — a payment was recorded.
            </p>
          )}

          {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

export function PaymentProofsTab() {
  const [proofs, setProofs] = useState<StaffPaymentProof[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("PENDING");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<StaffPaymentProof | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = filter ? `?status=${filter}` : "";
      setProofs(await apiFetch<StaffPaymentProof[]>(`/fees/payment-proofs${qs}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load payment proofs.");
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const pendingCount = (proofs ?? []).filter((p) => p.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Awaiting review" value={filter === "PENDING" ? (proofs?.length ?? "—") : pendingCount} tone="warning" />
        <StatCard
          label="Claimed (this view)"
          value={proofs ? formatMoney(proofs.reduce((sum, p) => sum + Number(p.amountClaimed), 0)) : "—"}
          tone="primary"
        />
        <StatCard label="Shown" value={proofs?.length ?? "—"} tone="accent" />
      </div>

      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              filter === f.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Claimed</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {proofs === null &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={4}>
                      <SkeletonRow avatar lines={2} />
                    </td>
                  </tr>
                ))}
              {proofs !== null && proofs.map((p) => (
                <tr key={p.id} onClick={() => setSelected(p)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{p.student.name}</p>
                    <p className="text-xs text-muted-foreground">{p.student.studentCode}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">₹{p.amountClaimed}</td>
                  <td className="px-4 py-3 text-foreground">{formatDateTime(p.submittedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
              {proofs && proofs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {proofs === null && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} avatar lines={2} />)}
          {proofs !== null && proofs.map((p) => (
            <div key={p.id} className="space-y-2 p-4" onClick={() => setSelected(p)}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{p.student.name}</p>
                  <p className="text-xs text-muted-foreground">{p.student.studentCode}</p>
                </div>
                <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                ₹{p.amountClaimed} · {formatDateTime(p.submittedAt)}
              </p>
            </div>
          ))}
          {proofs && proofs.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nothing here.</p>}
        </div>
      </div>

      <ReviewModal proof={selected} onClose={() => setSelected(null)} onDone={load} />
    </div>
  );
}
