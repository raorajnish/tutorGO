"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import type { DistributionItem, DistributionRosterResponse } from "@/lib/types";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

interface Props {
  item: DistributionItem | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Roster-style toggle + bulk-mark view for one distribution item — the
 * screen staff actually use while physically standing in a room handing out
 * books, so it's built to work one-handed on a phone: card list below `sm`,
 * table above, same pattern as DefaultersTab. See changes-phase8.md §8e. */
export function DistributionRosterModal({ item, onClose, onChanged }: Props) {
  const [data, setData] = useState<DistributionRosterResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  async function load(itemId: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<DistributionRosterResponse>(`/distribution/items/${itemId}/receipts`);
      setData(res);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load this roster.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!item) return;
    setSearch("");
    setSelected(new Set());
    load(item.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.receipts;
    return data.receipts.filter(
      (r) => r.student.name.toLowerCase().includes(q) || r.student.studentCode.toLowerCase().includes(q)
    );
  }, [data, search]);

  const pendingFiltered = filtered.filter((r) => r.receivedAt === null);

  function toggleSelected(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function selectAllPending() {
    setSelected(new Set(pendingFiltered.map((r) => r.student.id)));
  }

  async function toggleOne(studentId: string, received: boolean) {
    if (!item) return;
    setBusyId(studentId);
    try {
      await apiFetch(`/distribution/items/${item.id}/receipts/${studentId}`, {
        method: "PATCH",
        body: JSON.stringify({ received }),
      });
      await load(item.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this student.");
    } finally {
      setBusyId(null);
    }
  }

  async function markSelectedReceived() {
    if (!item || selected.size === 0) return;
    setBulkSaving(true);
    setError(null);
    try {
      await apiFetch(`/distribution/items/${item.id}/receipts/bulk`, {
        method: "POST",
        body: JSON.stringify({ studentIds: [...selected] }),
      });
      setSelected(new Set());
      await load(item.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not mark the selected students.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={item?.name ?? ""}
      description={data ? `${data.receivedCount} of ${data.totalCount} received` : undefined}
      width="xl"
    >
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search name or student ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            {selected.size > 0 && (
              <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            )}
            <Button variant="secondary" onClick={selectAllPending} disabled={pendingFiltered.length === 0}>
              Select all pending
            </Button>
            <Button onClick={markSelectedReceived} disabled={selected.size === 0 || bulkSaving}>
              {bulkSaving ? "Marking…" : "Mark selected received"}
            </Button>
          </div>
        </div>

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}

        {!loading && (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden max-h-[55vh] overflow-y-auto overflow-x-auto rounded-xl border border-border sm:block">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 px-4 py-2.5"></th>
                    <th className="px-4 py-2.5 font-medium">Student</th>
                    <th className="px-4 py-2.5 font-medium">Batch</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5">
                        {r.receivedAt === null && (
                          <input
                            type="checkbox"
                            className="accent-primary"
                            checked={selected.has(r.student.id)}
                            onChange={() => toggleSelected(r.student.id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground">{r.student.name}</p>
                        <p className="text-xs text-muted-foreground">{r.student.studentCode}</p>
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{r.batch?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {r.receivedAt ? (
                          <Badge tone="success">Received {fmtDate(r.receivedAt)}</Badge>
                        ) : (
                          <Badge tone="neutral">Pending</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={busyId === r.student.id}
                          onClick={() => toggleOne(r.student.id, r.receivedAt === null)}
                          className="text-xs font-medium text-accent underline underline-offset-2 disabled:opacity-50"
                        >
                          {r.receivedAt ? "Mark pending" : "Mark received"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No students match.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards, large touch targets */}
            <div className="max-h-[60vh] space-y-2 overflow-y-auto sm:hidden">
              {filtered.map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      {r.receivedAt === null && (
                        <input
                          type="checkbox"
                          className="mt-1 accent-primary"
                          checked={selected.has(r.student.id)}
                          onChange={() => toggleSelected(r.student.id)}
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{r.student.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.student.studentCode} {r.batch ? `· ${r.batch.name}` : ""}
                        </p>
                      </div>
                    </div>
                    {r.receivedAt ? <Badge tone="success">Received</Badge> : <Badge tone="neutral">Pending</Badge>}
                  </div>
                  <button
                    type="button"
                    disabled={busyId === r.student.id}
                    onClick={() => toggleOne(r.student.id, r.receivedAt === null)}
                    className="mt-2 w-full rounded-lg border border-border py-2 text-sm font-medium text-foreground disabled:opacity-50"
                  >
                    {busyId === r.student.id ? "Saving…" : r.receivedAt ? "Mark pending" : "Mark received"}
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No students match.</p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
