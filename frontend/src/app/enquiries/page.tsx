"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { EnquiryModal } from "@/components/enquiries/EnquiryModal";
import { MarkContactedModal } from "@/components/enquiries/MarkContactedModal";
import { EnquiryDetailModal } from "@/components/enquiries/EnquiryDetailModal";
import { Skeleton, SkeletonLine, SkeletonRow } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ENQUIRY_SOURCE_LABELS, ENQUIRY_STATUSES, ENQUIRY_STATUS_LABELS, type Course, type Enquiry, type EnquiryStatus } from "@/lib/types";
import { formatDate as fmtDate } from "@/lib/format";
import { Pagination, useClientPagination } from "@/components/ui/Pagination";

const STATUS_TONE: Record<EnquiryStatus, "primary" | "accent" | "success" | "danger"> = {
  NEW: "primary",
  CONTACTED: "accent",
  CONVERTED: "success",
  LOST: "danger",
};

export default function EnquiriesPage() {
  return (
    <Suspense fallback={null}>
      <EnquiriesContent />
    </Suspense>
  );
}

function EnquiriesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<EnquiryStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Enquiry | null>(null);
  const [detailTarget, setDetailTarget] = useState<Enquiry | null>(null);
  const [contactTarget, setContactTarget] = useState<Enquiry | null>(null);
  const [lostTarget, setLostTarget] = useState<Enquiry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Enquiry | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const updated = await apiFetch<Enquiry[]>(`/enquiries${qs}`);
      setEnquiries(updated);
      setDetailTarget((curr) => (curr ? updated.find((e) => e.id === curr.id) ?? null : null));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load enquiries.");
    } finally {
      setLoading(false);
    }
  }

  // Courses are a static lookup for the enquiry form/filter, not filtered by
  // search — fetched once rather than on every debounced keystroke.
  useEffect(() => {
    apiFetch<Course[]>("/academics/courses?active=true")
      .then(setCourses)
      .catch(() => setCourses([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (searchParams.get("open") === "create" || searchParams.get("create") === "true") {
      setEditing(null);
      setModalOpen(true);
    }
  }, [searchParams]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(enquiry: Enquiry) {
    setEditing(enquiry);
    setModalOpen(true);
  }

  async function markLost() {
    if (!lostTarget) return;
    await apiFetch(`/enquiries/${lostTarget.id}/lost`, { method: "POST" });
    await load();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await apiFetch(`/enquiries/${deleteTarget.id}`, { method: "DELETE" });
    setDetailTarget((curr) => (curr?.id === deleteTarget.id ? null : curr));
    await load();
  }

  function convertToAdmission(enquiry: Enquiry) {
    router.push(`/admissions?enquiryId=${enquiry.id}`);
  }

  const counts = ENQUIRY_STATUSES.reduce<Record<EnquiryStatus, number>>(
    (acc, s) => ({ ...acc, [s]: enquiries.filter((e) => e.status === s).length }),
    { NEW: 0, CONTACTED: 0, CONVERTED: 0, LOST: 0 }
  );
  const visible = statusTab === "ALL" ? enquiries : enquiries.filter((e) => e.status === statusTab);
  const emptyLabel = statusTab === "ALL" ? "enquiries" : `${ENQUIRY_STATUS_LABELS[statusTab].toLowerCase()} enquiries`;
  const { paginatedItems, paginationProps } = useClientPagination(visible, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Enquiries</h1>
          <p className="mt-1 text-sm text-muted-foreground hidden sm:block">Capture leads and work them through to admission.</p>
        </div>
        <Button onClick={openCreate}>New enquiry</Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        <Skeleton loading={loading}>
          <StatCard label="New" value={counts.NEW} tone="primary" />
        </Skeleton>
        <Skeleton loading={loading}>
          <StatCard label="Contacted" value={counts.CONTACTED} tone="accent" />
        </Skeleton>
        <Skeleton loading={loading}>
          <StatCard label="Converted" value={counts.CONVERTED} tone="success" />
        </Skeleton>
        <Skeleton loading={loading}>
          <StatCard label="Lost" value={counts.LOST} tone="warning" />
        </Skeleton>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {/* Filters */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search name, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:max-w-xs"
          />
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap">
            <button
              type="button"
              onClick={() => setStatusTab("ALL")}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors sm:px-3.5 sm:py-1.5 sm:text-sm ${
                statusTab === "ALL" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              All ({enquiries.length})
            </button>
            {ENQUIRY_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusTab(s)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors sm:px-3.5 sm:py-1.5 sm:text-sm ${
                  statusTab === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}
              >
                {ENQUIRY_STATUS_LABELS[s]} ({counts[s]})
              </button>
            ))}
          </div>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        {/* Desktop / Tablet Table (Scrollable when needed, no squishing) */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm min-w-[750px]">
            <thead className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Follow-up</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && Array.from({ length: 6 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={6}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
              {!loading && paginatedItems.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setDetailTarget(e)}
                  className="cursor-pointer transition-colors hover:bg-muted/60"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground hover:text-primary transition-colors">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">{e.course ? `${e.course.name} (${e.course.code})` : "—"}</td>
                  <td className="px-4 py-3 text-foreground">{ENQUIRY_SOURCE_LABELS[e.source]}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{e.nextFollowUpDate ? fmtDate(e.nextFollowUpDate) : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[e.status]}>{ENQUIRY_STATUS_LABELS[e.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      {(e.status === "NEW" || e.status === "CONTACTED") && (
                        <Button
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            convertToAdmission(e);
                          }}
                        >
                          Convert
                        </Button>
                      )}
                      <ActionMenu
                        items={[
                          { label: "View details", onClick: () => setDetailTarget(e) },
                          { label: "Edit", onClick: () => openEdit(e) },
                          ...(e.status === "NEW" ? [{ label: "Mark contacted", onClick: () => setContactTarget(e) }] : []),
                          ...(e.status === "NEW" || e.status === "CONTACTED" ? [{ label: "Mark lost", onClick: () => setLostTarget(e), tone: "danger" as const }] : []),
                          { label: "Delete", onClick: () => setDeleteTarget(e), tone: "danger" as const },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message={`No ${emptyLabel}.`} actionLabel="New enquiry" onAction={openCreate} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="divide-y divide-border sm:hidden">
          {loading && Array.from({ length: 4 }, (_, i) => (
            <div key={`sk-${i}`} className="space-y-2.5 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1.5 w-1/2">
                  <SkeletonLine className="w-3/4 h-4" />
                  <SkeletonLine className="w-1/2 h-3" />
                </div>
                <SkeletonLine className="w-16 h-5 rounded-full" />
              </div>
              <SkeletonLine className="w-2/3 h-3" />
              <SkeletonLine className="w-full h-8 rounded-lg" />
            </div>
          ))}
          {!loading && paginatedItems.map((e) => (
            <div
              key={e.id}
              onClick={() => setDetailTarget(e)}
              className="cursor-pointer space-y-2.5 p-3.5 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-foreground text-sm hover:text-primary transition-colors">{e.name}</h4>
                  <p className="text-xs text-muted-foreground">{e.phone}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0" onClick={(event) => event.stopPropagation()}>
                  <Badge tone={STATUS_TONE[e.status]}>{ENQUIRY_STATUS_LABELS[e.status]}</Badge>
                  <ActionMenu
                    items={[
                      { label: "View details", onClick: () => setDetailTarget(e) },
                      { label: "Edit", onClick: () => openEdit(e) },
                      ...(e.status === "NEW" ? [{ label: "Mark contacted", onClick: () => setContactTarget(e) }] : []),
                      ...(e.status === "NEW" || e.status === "CONTACTED" ? [{ label: "Mark lost", onClick: () => setLostTarget(e), tone: "danger" as const }] : []),
                      { label: "Delete", onClick: () => setDeleteTarget(e), tone: "danger" as const },
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5 font-medium text-foreground">
                  {e.course ? `${e.course.name} (${e.course.code})` : "Institute-wide"}
                </span>
                <span>• {ENQUIRY_SOURCE_LABELS[e.source]}</span>
                {e.nextFollowUpDate && <span>• Follow-up: {fmtDate(e.nextFollowUpDate)}</span>}
              </div>

              {(e.status === "NEW" || e.status === "CONTACTED") && (
                <div className="pt-1" onClick={(event) => event.stopPropagation()}>
                  <Button
                    variant="secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      convertToAdmission(e);
                    }}
                    className="w-full"
                  >
                    Convert to admission
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!loading && visible.length === 0 && (
            <EmptyState message={`No ${emptyLabel}.`} actionLabel="New enquiry" onAction={openCreate} />
          )}
        </div>

        {!loading && visible.length > 0 && (
          <Pagination
            {...paginationProps}
            pageSizeOptions={[10, 20, 50]}
            className="border-t border-border bg-card/50"
          />
        )}
      </div>

      <EnquiryDetailModal
        open={!!detailTarget}
        enquiry={detailTarget}
        onClose={() => setDetailTarget(null)}
        onEdit={openEdit}
        onContact={setContactTarget}
        onLost={setLostTarget}
        onConvert={convertToAdmission}
      />

      <EnquiryModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={load} editing={editing} courses={courses} />

      <MarkContactedModal enquiry={contactTarget} onClose={() => setContactTarget(null)} onSaved={load} />

      <ConfirmModal
        open={!!lostTarget}
        onClose={() => setLostTarget(null)}
        onConfirm={markLost}
        title={`Mark ${lostTarget?.name ?? "this lead"} as lost?`}
        confirmLabel="Mark lost"
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete ${deleteTarget?.name ?? "this enquiry"}?`}
        confirmLabel="Delete enquiry"
      />
    </div>
  );
}

