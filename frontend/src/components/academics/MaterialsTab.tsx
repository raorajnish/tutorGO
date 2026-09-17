"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination, useClientPagination } from "@/components/ui/Pagination";
import { CreateMaterialModal } from "./CreateMaterialModal";
import type { AcademicsTabHandle } from "./tabHandle";
import type { Course, Batch, Subject } from "@/lib/types";

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export interface StudyResourceItem {
  id: string;
  title: string;
  description: string | null;
  kind: "FILE" | "LINK" | "HOMEWORK";
  assetUrl: string | null;
  externalUrl: string | null;
  dueDate: string | null;
  createdAt: string;
  course: { id: string; name: string; code: string };
  batch: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
  uploadedBy: { id: string; fullName: string; role: string };
}

interface Props {
  courses?: Course[];
  batches?: Batch[];
  subjects?: Subject[];
}

export const MaterialsTab = forwardRef<AcademicsTabHandle, Props>(function MaterialsTab(
  { courses: initialCourses, batches: initialBatches, subjects: initialSubjects },
  ref
) {
  const [materials, setMaterials] = useState<StudyResourceItem[]>([]);
  const [courses, setCourses] = useState<Course[]>(initialCourses || []);
  const [batches, setBatches] = useState<Batch[]>(initialBatches || []);
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterBatchId, setFilterBatchId] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreateModalOpen(true),
  }));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, cRes, bRes, sRes] = await Promise.all([
        apiFetch<StudyResourceItem[]>("/materials"),
        initialCourses ? Promise.resolve(initialCourses) : apiFetch<Course[]>("/academics/courses"),
        initialBatches ? Promise.resolve(initialBatches) : apiFetch<Batch[]>("/academics/batches"),
        initialSubjects ? Promise.resolve(initialSubjects) : apiFetch<Subject[]>("/academics/subjects"),
      ]);
      setMaterials(mRes);
      setCourses(cRes);
      setBatches(bRes);
      setSubjects(sRes);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load materials.");
    } finally {
      setLoading(false);
    }
  }, [initialCourses, initialBatches, initialSubjects]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this item?")) return;
    setDeletingId(id);
    try {
      await apiFetch(`/materials/${id}`, { method: "DELETE" });
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Failed to delete item.");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = materials.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(search.toLowerCase())) ||
      (item.subject && item.subject.name.toLowerCase().includes(search.toLowerCase()));

    const matchesBatch = !filterBatchId || item.batch?.id === filterBatchId;
    const matchesType = filterType === "ALL" || item.kind === filterType;

    return matchesSearch && matchesBatch && matchesType;
  });

  const { paginatedItems, paginationProps } = useClientPagination(filtered, 10);

  const homeworkCount = materials.filter((m) => m.kind === "HOMEWORK").length;
  const fileCount = materials.filter((m) => m.kind === "FILE").length;
  const videoCount = materials.filter((m) => m.kind === "LINK").length;

  const batchOptions = [
    { value: "", label: "All batches" },
    ...batches.map((b) => ({ value: b.id, label: b.name })),
  ];

  const typeOptions = [
    { value: "ALL", label: "All types" },
    { value: "HOMEWORK", label: "Homework" },
    { value: "FILE", label: "PDFs / Notes" },
    { value: "LINK", label: "Video links" },
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        <StatCard label="Total materials" value={materials.length} tone="primary" />
        <StatCard label="Homework tasks" value={homeworkCount} tone="warning" />
        <StatCard label="PDFs & notes" value={fileCount} tone="success" />
        <StatCard label="Video lectures" value={videoCount} tone="accent" />
      </div>

      {/* Main Table & Filter Container */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 flex-1">
              <Input
                placeholder="Search title or subject..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Dropdown
                value={filterBatchId}
                onChange={setFilterBatchId}
                options={batchOptions}
                placeholder="All batches"
              />
              <Dropdown
                value={filterType}
                onChange={setFilterType}
                options={typeOptions}
                placeholder="All types"
              />
            </div>

            <Button onClick={() => setCreateModalOpen(true)}>Add material</Button>
          </div>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        {/* Desktop Table View */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Title & Description</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Batch / Subject</th>
                <th className="px-4 py-3 font-medium">Uploaded By</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }, (_, i) => (
                  <tr key={`sk-${i}`}>
                    <td colSpan={5}>
                      <SkeletonRow lines={2} />
                    </td>
                  </tr>
                ))}
              {!loading &&
                paginatedItems.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{m.title}</p>
                      {m.description && <p className="text-xs text-muted-foreground line-clamp-1">{m.description}</p>}
                      {m.dueDate && (
                        <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 mt-0.5">
                          Due date: {new Date(m.dueDate).toLocaleDateString()}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {m.kind === "HOMEWORK" ? (
                        <Badge tone="warning">Homework</Badge>
                      ) : m.kind === "FILE" ? (
                        <Badge tone="success">PDF / Notes</Badge>
                      ) : (
                        <Badge tone="accent">Video Link</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">{m.batch?.name || "All Batches"}</p>
                      <p>{m.subject?.name || "All Subjects"}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {m.uploadedBy?.fullName || "Faculty"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {m.externalUrl && (
                          <a
                            href={m.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                          >
                            Link <ExternalLinkIcon />
                          </a>
                        )}
                        {m.assetUrl && (
                          <a
                            href={m.assetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                          >
                            PDF <DownloadIcon />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(m.id)}
                          disabled={deletingId === m.id}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-danger/70 transition-colors hover:bg-danger-soft hover:text-danger"
                          title="Delete material"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="divide-y divide-border sm:hidden">
          {loading && Array.from({ length: 5 }, (_, i) => <SkeletonRow key={`sk-${i}`} lines={2} />)}
          {!loading &&
            paginatedItems.map((m) => (
              <div key={m.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{m.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.batch?.name || "All Batches"} · {m.subject?.name || "All Subjects"}
                    </p>
                  </div>
                  {m.kind === "HOMEWORK" ? (
                    <Badge tone="warning">Homework</Badge>
                  ) : m.kind === "FILE" ? (
                    <Badge tone="success">PDF / Notes</Badge>
                  ) : (
                    <Badge tone="accent">Video Link</Badge>
                  )}
                </div>

                {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}

                {m.dueDate && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Due date: {new Date(m.dueDate).toLocaleDateString()}
                  </p>
                )}

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-3">
                    {m.externalUrl && (
                      <a
                        href={m.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                      >
                        Link <ExternalLinkIcon />
                      </a>
                    )}
                    {m.assetUrl && (
                      <a
                        href={m.assetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        PDF <DownloadIcon />
                      </a>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(m.id)}
                    disabled={deletingId === m.id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-danger/70 transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
        </div>

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <EmptyState
            message="No study materials or homework found."
            actionLabel="Add material"
            onAction={() => setCreateModalOpen(true)}
          />
        )}

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <Pagination
            {...paginationProps}
            pageSizeOptions={[10, 20, 50]}
            className="border-t border-border bg-card/50"
          />
        )}
      </div>

      {/* Modal */}
      <CreateMaterialModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={loadData}
        courses={courses}
        batches={batches}
        subjects={subjects}
      />
    </div>
  );
});
