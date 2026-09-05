"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, apiUpload, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Dropdown } from "@/components/ui/Dropdown";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SkeletonRow } from "@/components/ui/Skeleton";
import { formatDate } from "@/lib/format";
import type { Course, StudyResource, StudyResourceUploadResult, Subject } from "@/lib/types";

const FILE_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinejoin="round" />
    <path d="M14 2v6h6" strokeLinejoin="round" />
  </svg>
);

const LINK_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.5-1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Staff-side study material library (changes-phase12.md §12.5). Course-scoped
 * with an optional subject — the same notes serve every batch of a course, so
 * scoping per batch would only mean re-uploading the same PDF and letting the
 * copies drift. */
export default function StudyMaterialPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courseId, setCourseId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [resources, setResources] = useState<StudyResource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudyResource | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Course[]>("/academics/courses?active=true"),
      apiFetch<Subject[]>("/academics/subjects"),
    ])
      .then(([c, s]) => {
        setCourses(c);
        setSubjects(s);
      })
      .catch(() => setError("Could not load courses and subjects."));
  }, []);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (courseId) qs.set("courseId", courseId);
      if (subjectId) qs.set("subjectId", subjectId);
      setResources(await apiFetch<StudyResource[]>(`/study-resources?${qs.toString()}`));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load study material.");
    }
  }, [courseId, subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  // Only subjects actually taught on the selected course can be filtered by —
  // offering the rest would produce guaranteed-empty results.
  const subjectsForCourse = courseId
    ? subjects.filter((s) => s.courses.some((c) => c.id === courseId))
    : subjects;

  useEffect(() => {
    setSubjectId("");
  }, [courseId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Institute</p>
          <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Study material</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Notes, PDFs and links shared with students — by course, and optionally by subject.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>Add material</Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[220px] flex-1">
          <Dropdown
            label="Course"
            value={courseId}
            onChange={setCourseId}
            options={[
              { value: "", label: "All courses" },
              ...courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` })),
            ]}
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <Dropdown
            label="Subject"
            value={subjectId}
            onChange={setSubjectId}
            options={[
              { value: "", label: "All subjects" },
              ...subjectsForCourse.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

      <div className="hidden overflow-hidden rounded-xl border border-border bg-card sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Title</th>
              <th className="px-4 py-2.5">Course / Subject</th>
              <th className="px-4 py-2.5">Added by</th>
              <th className="px-4 py-2.5">Added</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {resources === null &&
              Array.from({ length: 5 }, (_, i) => (
                <tr key={`sk-${i}`}>
                  <td colSpan={5}>
                    <SkeletonRow lines={2} />
                  </td>
                </tr>
              ))}
            {resources?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">
                  <a
                    href={r.kind === "FILE" ? r.assetUrl! : r.externalUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 font-medium text-foreground hover:underline"
                  >
                    <span className="text-muted-foreground">{r.kind === "FILE" ? FILE_ICON : LINK_ICON}</span>
                    {r.title}
                  </a>
                  {r.description && <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {r.course.name}
                  <span className="block text-xs">{r.subject ? r.subject.name : "All subjects"}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.uploadedBy.fullName}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(r.createdAt, { year: false })}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(r)}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {resources && resources.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No study material yet. Add a PDF or a link to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 sm:hidden">
        {resources?.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-card p-4">
            <a
              href={r.kind === "FILE" ? r.assetUrl! : r.externalUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-medium text-foreground"
            >
              <span className="text-muted-foreground">{r.kind === "FILE" ? FILE_ICON : LINK_ICON}</span>
              {r.title}
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.course.name} · {r.subject ? r.subject.name : "All subjects"}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{formatDate(r.createdAt, { year: false })}</span>
              <button type="button" onClick={() => setDeleteTarget(r)} className="text-xs font-medium text-danger">
                Delete
              </button>
            </div>
          </div>
        ))}
        {resources && resources.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No study material yet.
          </p>
        )}
      </div>

      <AddResourceModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={load}
        courses={courses}
        subjects={subjects}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await apiFetch(`/study-resources/${deleteTarget!.id}`, { method: "DELETE" });
          load();
        }}
        title={`Delete "${deleteTarget?.title ?? "this material"}"?`}
        confirmLabel="Delete"
        destructive
        description={
          deleteTarget?.kind === "FILE"
            ? "The file is removed from storage as well, and students lose access to it immediately."
            : "Students lose access to this link immediately."
        }
      />
    </div>
  );
}

function AddResourceModal({
  open,
  onClose,
  onAdded,
  courses,
  subjects,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
  courses: Course[];
  subjects: Subject[];
}) {
  const [kind, setKind] = useState<"FILE" | "LINK">("LINK");
  const [courseId, setCourseId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setKind("LINK");
    setCourseId("");
    setSubjectId("");
    setTitle("");
    setDescription("");
    setExternalUrl("");
    setFile(null);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const subjectsForCourse = courseId ? subjects.filter((s) => s.courses.some((c) => c.id === courseId)) : [];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let asset: StudyResourceUploadResult | null = null;
      if (kind === "FILE") {
        if (!file) throw new Error("Pick a file first.");
        asset = await apiUpload<StudyResourceUploadResult>("/study-resources/upload", file);
      }

      await apiFetch("/study-resources", {
        method: "POST",
        body: JSON.stringify({
          courseId,
          subjectId: subjectId || null,
          title,
          description: description.trim() || null,
          kind,
          externalUrl: kind === "LINK" ? externalUrl.trim() : null,
          assetUrl: asset?.url ?? null,
          assetName: asset?.name ?? null,
          assetPublicId: asset?.publicId ?? null,
        }),
      });

      onAdded();
      handleClose();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "Could not add this material."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = courseId && title.trim() && (kind === "LINK" ? externalUrl.trim() : file);

  return (
    <Modal open={open} onClose={handleClose} title="Add study material" width="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Type</p>
          <div className="grid grid-cols-2 gap-2">
            {(["LINK", "FILE"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                  kind === k
                    ? "border-primary bg-secondary text-secondary-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary"
                }`}
              >
                {k === "LINK" ? "Link (YouTube, Drive…)" : "File (PDF)"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Dropdown
            label="Course"
            value={courseId}
            onChange={(v) => {
              setCourseId(v);
              setSubjectId("");
            }}
            options={courses.map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))}
            placeholder="Select a course"
          />
          <Dropdown
            label="Subject (optional)"
            value={subjectId}
            onChange={setSubjectId}
            disabled={!courseId}
            options={[
              { value: "", label: "All subjects on this course" },
              ...subjectsForCourse.map((s) => ({ value: s.id, label: s.name })),
            ]}
            placeholder="All subjects on this course"
          />
        </div>

        <Input label="Title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />

        <Textarea
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={2}
        />

        {kind === "LINK" ? (
          <Input
            label="Link"
            type="url"
            placeholder="https://youtube.com/watch?v=…"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
          />
        ) : file ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} className="text-xs text-danger hover:underline">
              Remove
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-border bg-muted px-4 py-6 text-sm text-muted-foreground hover:bg-secondary">
            Tap to select a PDF
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
            />
          </label>
        )}

        {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || submitting}>
            {submitting ? "Adding…" : "Add material"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
