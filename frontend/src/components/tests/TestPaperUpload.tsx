"use client";

import { useRef, useState } from "react";
import { apiUpload, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import type { TestPaperAsset } from "@/lib/types";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;

/** Attaching the question paper is optional everywhere it appears — a test
 * scheduled without one is perfectly valid, so this never blocks submission. */
export function TestPaperUpload({
  value,
  onChange,
}: {
  value: TestPaperAsset | null;
  onChange: (asset: TestPaperAsset | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("File must be 10MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      onChange(await apiUpload<TestPaperAsset>("/tests/upload", file));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not upload this file.");
    } finally {
      setUploading(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
          {value.type === "pdf" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{value.name}</p>
          <a
            href={value.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-accent hover:opacity-80"
          >
            Preview
          </a>
        </div>
        <Button variant="ghost" onClick={() => onChange(null)}>
          Remove
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-foreground">Question paper (optional)</p>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void handleFile(file);
        }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? "border-accent bg-accent/5" : "border-border"
        }`}
      >
        <p className="text-sm text-muted-foreground">
          {uploading ? "Uploading…" : "Drop a PDF or image here"}
        </p>
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
          Choose file
        </Button>
        <p className="text-xs text-muted-foreground">PDF, PNG, JPEG or WebP · up to 10MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
