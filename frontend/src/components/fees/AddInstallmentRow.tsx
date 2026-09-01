"use client";

import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { todayInput } from "@/lib/format";

interface Props {
  studentId: string;
  nextSeq: number;
  onAdded: () => void;
  onCancel: () => void;
}

export function AddInstallmentRow({ studentId, nextSeq, onAdded, onCancel }: Props) {
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayInput());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/fees/accounts/${studentId}/installments`, {
        method: "POST",
        body: JSON.stringify({ dueDate, amount: Number(amount) }),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not add this installment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-border p-3">
      <span className="pb-2.5 text-sm text-muted-foreground">#{nextSeq}</span>
      <Input label="Amount (₹)" type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-32" />
      <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-40" />
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={handleAdd} disabled={busy || !amount}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
