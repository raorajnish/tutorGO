"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { DistributionRosterModal } from "@/components/distribution/DistributionRosterModal";
import type { Course, DistributionItem } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";

export default function DistributionPage() {
  const [items, setItems] = useState<DistributionItem[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [rosterItem, setRosterItem] = useState<DistributionItem | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch<DistributionItem[]>(`/distribution/items${includeInactive ? "?includeInactive=true" : ""}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load distribution items.");
    } finally {
      setLoading(false);
    }
  }

  // Courses are a static lookup for the "new item" form, not filtered by
  // includeInactive — fetched once rather than every time that toggles.
  useEffect(() => {
    apiFetch<Course[]>("/academics/courses")
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeInactive]);

  const totalStudentSlots = items.reduce((sum, i) => sum + i.studentCount, 0);
  const totalReceived = items.reduce((sum, i) => sum + i.receivedCount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Distribution</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track books, bags, T-shirts, or anything else your class hands out to students.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="shrink-0">
          New item
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active items" value={items.filter((i) => i.isActive).length} tone="primary" />
        <StatCard label="Total receipts tracked" value={totalStudentSlots} tone="accent" />
        <StatCard label="Handed out" value={totalReceived} tone="success" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-sm font-medium text-foreground">All items</p>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="accent-primary"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        {/* Desktop / tablet: table */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Scope</th>
                <th className="px-4 py-3 font-medium">Progress</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-muted"
                  onClick={() => setRosterItem(item)}
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {item.name}
                    {item.totalSets !== null && <span className="ml-1.5 text-xs text-muted-foreground">({item.totalSets} sets)</span>}
                  </td>
                  <td className="px-4 py-3 text-foreground">{item.course ? `${item.course.name} (${item.course.code})` : "Institute-wide"}</td>
                  <td className="px-4 py-3 text-foreground">
                    {item.receivedCount}/{item.studentCount} received
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Active" : "Inactive"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground">{fmtDate(item.createdAt)}</td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No distribution items yet — create the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile: cards */}
        <div className="divide-y divide-border sm:hidden">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRosterItem(item)}
              className="block w-full space-y-2 p-4 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.course ? `${item.course.name} (${item.course.code})` : "Institute-wide"}</p>
                </div>
                <Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.receivedCount}/{item.studentCount} received
                {item.totalSets !== null ? ` · ${item.totalSets} sets` : ""}
              </p>
            </button>
          ))}
          {!loading && items.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No distribution items yet.</p>
          )}
        </div>
      </div>

      <AddItemModal open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} courses={courses} />
      <DistributionRosterModal item={rosterItem} onClose={() => setRosterItem(null)} onChanged={load} />
    </div>
  );
}

function AddItemModal({
  open,
  onClose,
  onCreated,
  courses,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  courses: Course[];
}) {
  const [name, setName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [totalSets, setTotalSets] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setCourseId("");
    setTotalSets("");
    setError(null);
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/distribution/items", {
        method: "POST",
        body: JSON.stringify({
          name,
          courseId: courseId || undefined,
          totalSets: totalSets ? Number(totalSets) : undefined,
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create this item.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New distribution item"
      description="Every currently-enrolled matching student gets a pending receipt right away."
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="add-item-form" disabled={submitting || !name.trim()}>
            {submitting ? "Creating…" : "Create item"}
          </Button>
        </>
      }
    >
      <form id="add-item-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Chemistry digest" />
        <Dropdown
          label="Scope (optional)"
          value={courseId}
          onChange={setCourseId}
          options={[{ value: "", label: "Institute-wide" }, ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))]}
          placeholder="Institute-wide"
        />
        <Input
          label="Total sets (optional)"
          type="number"
          min={1}
          value={totalSets}
          onChange={(e) => setTotalSets(e.target.value)}
          placeholder="e.g. 60"
        />
        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
