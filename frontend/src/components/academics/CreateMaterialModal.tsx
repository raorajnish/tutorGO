"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import type { Course, Batch, Subject } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  courses: Course[];
  batches: Batch[];
  subjects: Subject[];
  initialBatchId?: string;
  initialLectureId?: string;
  initialKind?: "FILE" | "LINK" | "HOMEWORK";
}

export function CreateMaterialModal({
  open,
  onClose,
  onSuccess,
  courses,
  batches,
  subjects,
  initialBatchId,
  initialLectureId,
  initialKind = "HOMEWORK",
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"FILE" | "LINK" | "HOMEWORK">(initialKind);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState(initialBatchId || "");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setKind(initialKind);
      setSelectedBatchId(initialBatchId || "");
      setSelectedCourseId("");
      setSelectedSubjectId("");
      setAssetUrl("");
      setExternalUrl("");
      setDueDate("");
      setError(null);
    }
  }, [open, initialBatchId, initialKind]);

  useEffect(() => {
    if (selectedBatchId) {
      const b = batches.find((item) => item.id === selectedBatchId);
      if (b && b.course) setSelectedCourseId(b.course.id);
    }
  }, [selectedBatchId, batches]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!selectedCourseId && !selectedBatchId && courses.length > 0) {
      // If course is available, use first course or course from batch
      const firstCourse = courses[0]?.id;
      if (firstCourse) setSelectedCourseId(firstCourse);
    }

    setError(null);
    setSubmitting(true);

    try {
      let resolvedCourse = selectedCourseId;
      if (!resolvedCourse && selectedBatchId) {
        const b = batches.find((item) => item.id === selectedBatchId);
        if (b && b.course) resolvedCourse = b.course.id;
      }
      if (!resolvedCourse && courses.length > 0) {
        resolvedCourse = courses[0].id;
      }

      await apiFetch("/materials", {
        method: "POST",
        body: JSON.stringify({
          courseId: resolvedCourse || undefined,
          batchId: selectedBatchId || undefined,
          subjectId: selectedSubjectId || undefined,
          lectureId: initialLectureId || undefined,
          title: title.trim(),
          description: description.trim() || undefined,
          kind,
          assetUrl: assetUrl.trim() || undefined,
          externalUrl: externalUrl.trim() || undefined,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        }),
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to create material.");
    } finally {
      setSubmitting(false);
    }
  }

  const batchOptions = [
    { value: "", label: "All batches in course" },
    ...batches.map((b) => ({ value: b.id, label: b.name })),
  ];

  const subjectOptions = [
    { value: "", label: "All subjects" },
    ...subjects.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === "HOMEWORK" ? "Assign Homework" : "Add Study Material"}
      description="Share notes, reference PDFs, YouTube video links, or assign homework to students."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-material-form" disabled={submitting}>
            {submitting ? "Saving…" : kind === "HOMEWORK" ? "Assign homework" : "Save material"}
          </Button>
        </>
      }
    >
      <form id="create-material-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">Material type</label>
          <div className="inline-flex w-full gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setKind("HOMEWORK")}
              data-active={kind === "HOMEWORK"}
              className="flex-1 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-sm"
            >
              Homework
            </button>
            <button
              type="button"
              onClick={() => setKind("FILE")}
              data-active={kind === "FILE"}
              className="flex-1 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-sm"
            >
              PDF / Notes
            </button>
            <button
              type="button"
              onClick={() => setKind("LINK")}
              data-active={kind === "LINK"}
              className="flex-1 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground data-[active=true]:bg-card data-[active=true]:text-foreground data-[active=true]:shadow-sm"
            >
              Video Link
            </button>
          </div>
        </div>

        <Input
          label="Title"
          required
          placeholder={
            kind === "HOMEWORK"
              ? "e.g. Exercise 4.2 Problems 1 to 10"
              : kind === "LINK"
              ? "e.g. Organic Chemistry Video Lecture"
              : "e.g. Physics Chapter 3 Notes PDF"
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Dropdown
            label="Batch"
            value={selectedBatchId}
            onChange={setSelectedBatchId}
            options={batchOptions}
            placeholder="Select batch"
          />

          <Dropdown
            label="Subject"
            value={selectedSubjectId}
            onChange={setSelectedSubjectId}
            options={subjectOptions}
            placeholder="Select subject"
          />
        </div>

        {kind === "HOMEWORK" && (
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        )}

        {kind === "LINK" && (
          <Input
            label="Video / External Link URL"
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=..."
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
          />
        )}

        {kind === "FILE" && (
          <Input
            label="Document / PDF File URL"
            type="url"
            required
            placeholder="https://example.com/notes.pdf"
            value={assetUrl}
            onChange={(e) => setAssetUrl(e.target.value)}
          />
        )}

        <Textarea
          label={kind === "HOMEWORK" ? "Homework Instructions" : "Description / Notes"}
          placeholder="Details for students..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
      </form>
    </Modal>
  );
}
