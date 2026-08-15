"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/StatCard";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { ActionMenu } from "@/components/ui/ActionMenu";
import { EnquiryModal } from "@/components/enquiries/EnquiryModal";
import { MarkContactedModal } from "@/components/enquiries/MarkContactedModal";
import { ENQUIRY_SOURCE_LABELS, ENQUIRY_STATUSES, ENQUIRY_STATUS_LABELS, type Course, type Enquiry, type EnquiryStatus } from "@/lib/types";

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" strokeLinecap="round" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_TONE: Record<EnquiryStatus, "primary" | "accent" | "success" | "danger"> = {
  NEW: "primary",
  CONTACTED: "accent",
  CONVERTED: "success",
  LOST: "danger",
};

export default function EnquiriesPage() {
  const router = useRouter();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<EnquiryStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Enquiry | null>(null);
  const [contactTarget, setContactTarget] = useState<Enquiry | null>(null);
  const [lostTarget, setLostTarget] = useState<Enquiry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Enquiry | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const [e, c] = await Promise.all([
        apiFetch<Enquiry[]>(`/enquiries${qs}`),
        apiFetch<Course[]>("/academics/courses"),
      ]);
      setEnquiries(e);
      setCourses(c);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load enquiries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Enquiries</h1>
          <p className="mt-1 text-sm text-muted-foreground">Capture leads and work them through to admission.</p>
        </div>
        <Button onClick={openCreate}>New enquiry</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="New" value={counts.NEW} tone="primary" />
        <StatCard label="Contacted" value={counts.CONTACTED} tone="accent" />
        <StatCard label="Converted" value={counts.CONVERTED} tone="success" />
        <StatCard label="Lost" value={counts.LOST} tone="warning" />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search name, phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStatusTab("ALL")}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
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
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  statusTab === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                }`}
              >
                {ENQUIRY_STATUS_LABELS[s]} ({counts[s]})
              </button>
            ))}
          </div>
        </div>

        {error && <div className="border-b border-border bg-danger-soft px-4 py-2 text-sm text-danger">{error}</div>}

        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-[22%] px-4 py-3 font-medium">Lead</th>
                <th className="w-[20%] px-4 py-3 font-medium">Course</th>
                <th className="w-[13%] px-4 py-3 font-medium">Source</th>
                <th className="w-[13%] px-4 py-3 font-medium">Follow-up</th>
                <th className="w-[12%] px-4 py-3 font-medium">Status</th>
                <th className="w-[20%] px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{e.name}</p>
                    <p className="text-xs text-muted-foreground">{e.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">{e.course ? `${e.course.name} (${e.course.code})` : "—"}</td>
                  <td className="px-4 py-3 text-foreground">{ENQUIRY_SOURCE_LABELS[e.source]}</td>
                  <td className="px-4 py-3 text-foreground">{e.nextFollowUpDate ? fmtDate(e.nextFollowUpDate) : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[e.status]}>{ENQUIRY_STATUS_LABELS[e.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(e)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        aria-label="Edit"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(e)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-danger/70 transition-colors hover:bg-danger-soft hover:text-danger"
                        aria-label="Delete"
                      >
                        <TrashIcon />
                      </button>
                      {(e.status === "NEW" || e.status === "CONTACTED") && (
                        <Button variant="secondary" onClick={() => convertToAdmission(e)}>
                          Convert
                        </Button>
                      )}
                      {(e.status === "NEW" || e.status === "CONTACTED") && (
                        <ActionMenu
                          items={[
                            { label: "Mark contacted", onClick: () => setContactTarget(e) },
                            { label: "Mark lost", onClick: () => setLostTarget(e), tone: "danger" },
                          ]}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No {emptyLabel}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border sm:hidden">
          {visible.map((e) => (
            <div key={e.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.phone}</p>
                </div>
                <Badge tone={STATUS_TONE[e.status]}>{ENQUIRY_STATUS_LABELS[e.status]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {e.course ? `${e.course.name} (${e.course.code})` : "No course"} · {ENQUIRY_SOURCE_LABELS[e.source]}
              </p>
              <div className="flex items-center gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => openEdit(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label="Edit"
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-danger/70 transition-colors hover:bg-danger-soft hover:text-danger"
                  aria-label="Delete"
                >
                  <TrashIcon />
                </button>
                {(e.status === "NEW" || e.status === "CONTACTED") && (
                  <Button variant="secondary" onClick={() => convertToAdmission(e)}>
                    Convert
                  </Button>
                )}
                {(e.status === "NEW" || e.status === "CONTACTED") && (
                  <ActionMenu
                    items={[
                      { label: "Mark contacted", onClick: () => setContactTarget(e) },
                      { label: "Mark lost", onClick: () => setLostTarget(e), tone: "danger" },
                    ]}
                  />
                )}
              </div>
            </div>
          ))}
          {!loading && visible.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No {emptyLabel}.
            </p>
          )}
        </div>
      </div>

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
