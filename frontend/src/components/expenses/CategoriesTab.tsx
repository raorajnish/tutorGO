"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { ExpenseCategory } from "@/lib/types";

export function CategoriesTab() {
  const [categories, setCategories] = useState<ExpenseCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const [deactivating, setDeactivating] = useState<ExpenseCategory | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    apiFetch<ExpenseCategory[]>("/expenses/categories")
      .then(setCategories)
      .catch(() => setError("Could not load categories."));
  }

  useEffect(load, []);

  async function toggleActive(category: ExpenseCategory) {
    setBusyId(category.id);
    try {
      await apiFetch(`/expenses/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update this category.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Manage the categories your expenses are grouped under.</p>
        <Button onClick={() => setAddOpen(true)} className="sm:w-auto">
          Add category
        </Button>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {categories?.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-3">
                  <Badge tone={c.kind === "INCOME" ? "success" : "primary"}>{c.kind === "INCOME" ? "Income" : "Expense"}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={c.isActive ? "success" : "danger"}>{c.isActive ? "Active" : "Inactive"}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    {c.isActive ? (
                      <Button variant="ghost" disabled={busyId === c.id} onClick={() => setDeactivating(c)}>
                        Deactivate
                      </Button>
                    ) : (
                      <Button variant="ghost" disabled={busyId === c.id} onClick={() => toggleActive(c)}>
                        Activate
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {categories && categories.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No categories yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CategoryModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} />
      <CategoryModal open={!!editing} onClose={() => setEditing(null)} onSaved={load} category={editing} />

      <ConfirmModal
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        onConfirm={async () => {
          if (deactivating) await toggleActive(deactivating);
        }}
        title={`Deactivate "${deactivating?.name}"?`}
        description="Existing expenses keep this category — you just won't be able to pick it for new ones until reactivated."
        confirmLabel="Deactivate"
      />
    </div>
  );
}

function CategoryModal({
  open,
  onClose,
  onSaved,
  category,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  category?: ExpenseCategory | null;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setError(null);
    }
  }, [open, category]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (category) {
        await apiFetch(`/expenses/categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      } else {
        await apiFetch("/expenses/categories", { method: "POST", body: JSON.stringify({ name }) });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save this category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={category ? "Rename category" : "Add category"} width="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" />
        {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </form>
    </Modal>
  );
}
