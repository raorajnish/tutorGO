"use client";

import { useRef, useState } from "react";
import { apiUpload, apiDownload, ApiClientError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

interface ImportRow {
  line: number;
  status: "CREATED" | "SKIPPED" | "ERROR";
  name?: string;
  reason?: string;
  studentCode?: string;
  tempPassword?: string;
}

interface ImportResponse {
  dryRun: boolean;
  created: number;
  skipped: number;
  errors: number;
  rows: ImportRow[];
}

const STATUS_STYLES: Record<ImportRow["status"], string> = {
  CREATED: "text-success",
  SKIPPED: "text-warning",
  ERROR: "text-danger",
};

interface Props {
  open: boolean;
  onClose: () => void;
  /** e.g. "Import students" */
  title: string;
  description: string;
  /** Template download, e.g. "/students/import/template.csv" */
  templatePath: string;
  templateFilename: string;
  /** Import endpoint, e.g. "/students/import" — called first with
   * dryRun=true for the preview, then dryRun=false on confirm. */
  importPath: string;
  onImported: () => void;
  /** Row-specific extra detail shown in its own column — a generated student
   * code, a temp password. Different endpoints surface different things. */
  extraColumnLabel: string;
  extraColumnValue: (row: ImportRow) => string;
}

/** Shared bulk-CSV-import flow: pick a file, preview what it would do against
 * the current data (nothing written yet), confirm to actually commit. Same
 * validate-then-commit report shape from every /import backend route — see
 * changes-phase12.md §12.1. One component rather than one per entity since
 * students and team import share the exact same upload → preview → confirm →
 * results shape, differing only in the template/columns and one extra field. */
export function ImportModal({
  open,
  onClose,
  title,
  description,
  templatePath,
  templateFilename,
  importPath,
  onImported,
  extraColumnLabel,
  extraColumnValue,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileChange() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setPreview(null);
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const res = await apiUpload<ImportResponse>(importPath, file, "file", { dryRun: "true" });
      setPreview(res);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiUpload<ImportResponse>(importPath, file, "file", { dryRun: "false" });
      setResult(res);
      onImported();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function downloadErrorReport() {
    const failedRows = (result ?? preview)?.rows.filter((r) => r.status === "ERROR") ?? [];
    const csv = toCsv([
      ["Line", "Name", "Reason"],
      ...failedRows.map((r) => [String(r.line), r.name ?? "", r.reason ?? ""]),
    ]);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-errors.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const shown = result ?? preview;

  return (
    <Modal open={open} onClose={handleClose} title={title} description={description} width="lg">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => apiDownload(templatePath, templateFilename)}
          className="text-sm font-medium text-primary hover:underline"
        >
          Download sample template
        </button>

        {!result && (
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80"
            />
          </div>
        )}

        {busy && <p className="text-sm text-muted-foreground">{fileName ? `Checking ${fileName}…` : "Working…"}</p>}

        {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

        {shown && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-success">{shown.created} {result ? "created" : "will create"}</span>
              <span className="text-warning">{shown.skipped} skipped</span>
              <span className="text-danger">{shown.errors} errors</span>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">{extraColumnLabel} / reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.rows.map((r) => (
                    <tr key={r.line}>
                      <td className="px-3 py-2 text-muted-foreground">{r.line}</td>
                      <td className="px-3 py-2 text-foreground">{r.name ?? "—"}</td>
                      <td className={`px-3 py-2 font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</td>
                      <td className="px-3 py-2 text-muted-foreground">{extraColumnValue(r) || r.reason || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {shown.errors > 0 && (
              <button type="button" onClick={downloadErrorReport} className="text-sm font-medium text-primary hover:underline">
                Download error report
              </button>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button variant="secondary" onClick={handleClose}>
            {result ? "Done" : "Cancel"}
          </Button>
          {preview && !result && (
            <Button onClick={handleConfirm} disabled={busy || preview.created === 0}>
              {busy ? "Importing…" : `Confirm import (${preview.created})`}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
