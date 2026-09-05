"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { PAYMENT_MODES, PAYMENT_MODE_LABELS, type Expense, type ExpenseCategory, type ExpenseEvent, type PaymentMode } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

export function ExpensesTab() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [events, setEvents] = useState<ExpenseEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  async function loadLookups() {
    try {
      const [allCategories, allEvents] = await Promise.all([
        apiFetch<ExpenseCategory[]>("/expenses/categories"),
        apiFetch<ExpenseEvent[]>("/expenses/events"),
      ]);
      setCategories(allCategories.filter((c) => c.isActive));
      setEvents(allEvents);
    } catch {
      setError("Could not load categories and events.");
    }
  }

  function loadExpenses() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (eventFilter) params.set("eventId", eventFilter);
    apiFetch<Expense[]>(`/expenses?${params.toString()}`)
      .then(setExpenses)
      .catch(() => setError("Could not load expenses."));
  }

  useEffect(() => {
    loadLookups();
  }, []);
  useEffect(loadExpenses, [from, to, categoryFilter, eventFilter]);

  const categoryOptions = useMemo(
    () => [{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
    [categories]
  );
  const eventOptions = useMemo(
    () => [{ value: "", label: "All events" }, ...events.map((e) => ({ value: e.id, label: e.name }))],
    [events]
  );

  async function handleDelete() {
    if (!deleting) return;
    await apiFetch(`/expenses/${deleting.id}`, { method: "DELETE" });
    loadExpenses();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:flex lg:flex-1 lg:gap-3">
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <div className="col-span-2 sm:col-span-1 lg:w-48">
            <Dropdown label="Category" value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} />
          </div>
          <div className="col-span-2 sm:col-span-1 lg:w-48">
            <Dropdown label="Event" value={eventFilter} onChange={setEventFilter} options={eventOptions} />
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)} className="w-full lg:w-auto">
          Add expense
        </Button>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Title</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Event</th>
              <th className="px-4 py-2.5">Mode</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {expenses === null &&
              Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={7}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
            {expenses?.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(e.date)}</td>
                <td className="px-4 py-3 font-medium text-foreground">{e.title}</td>
                <td className="px-4 py-3">
                  <Badge tone="primary">{e.category.name}</Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{e.event?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{PAYMENT_MODE_LABELS[e.mode]}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-foreground">{formatMoney(e.amount)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditing(e)}>
                      Edit
                    </Button>
                    <Button variant="ghost" onClick={() => setDeleting(e)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {expenses && expenses.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No expenses recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ExpenseModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          loadExpenses();
          loadLookups();
        }}
        categories={categories}
        events={events}
      />
      <ExpenseModal
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          loadExpenses();
          loadLookups();
        }}
        categories={categories}
        events={events}
        expense={editing}
      />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleting?.title}"?`}
        description="This removes the expense and its entry from the combined ledger."
      />
    </div>
  );
}

function ExpenseModal({
  open,
  onClose,
  onSaved,
  categories,
  events,
  expense,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  categories: ExpenseCategory[];
  events: ExpenseEvent[];
  expense?: Expense | null;
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [eventId, setEventId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<PaymentMode>("CASH");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(expense?.title ?? "");
    setCategoryId(expense?.category.id ?? "");
    setEventId(expense?.event?.id ?? "");
    setAmount(expense?.amount ?? "");
    setDate(expense ? expense.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setMode(expense?.mode ?? "CASH");
    setReferenceNo(expense?.referenceNo ?? "");
    setNotes(expense?.notes ?? "");
    setNewEventName("");
    setError(null);
  }, [open, expense]);

  const eventOptions = [
    { value: "", label: "No event — general expense" },
    ...events.map((ev) => ({ value: ev.id, label: ev.name })),
    { value: "__new__", label: "+ New event…" },
  ];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let finalEventId = eventId || undefined;
      if (finalEventId === "__new__") {
        if (!newEventName.trim()) throw new ApiClientError(400, "BAD_REQUEST", "Enter a name for the new event.");
        const created = await apiFetch<ExpenseEvent>("/expenses/events", {
          method: "POST",
          body: JSON.stringify({ name: newEventName.trim() }),
        });
        finalEventId = created.id;
      }

      const payload = {
        title,
        categoryId,
        eventId: finalEventId,
        amount: Number(amount),
        date,
        mode,
        referenceNo: mode === "CASH" ? undefined : referenceNo,
        notes: notes || undefined,
      };

      if (expense) {
        await apiFetch(`/expenses/${expense.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/expenses", { method: "POST", body: JSON.stringify(payload) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save this expense.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={expense ? "Edit expense" : "Add expense"} width="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Electricity bill" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dropdown
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Select category…"
          />
          <Input label="Amount (₹)" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Dropdown label="Payment mode" value={mode} onChange={(v) => setMode(v as PaymentMode)} options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))} />
        </div>

        {mode !== "CASH" && (
          <Input
            label="Reference no."
            required
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            placeholder="UPI ref / UTR / cheque no."
          />
        )}

        <div className="space-y-3">
          <Dropdown label="Event (optional)" value={eventId} onChange={setEventId} options={eventOptions} />
          {eventId === "__new__" && (
            <Input
              label="New event name"
              required
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="e.g. Annual Day 2026"
            />
          )}
        </div>

        <Textarea label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

        {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving…" : "Save expense"}
        </Button>
      </form>
    </Modal>
  );
}
