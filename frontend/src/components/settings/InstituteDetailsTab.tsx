"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, apiDownload, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { InstituteProfile } from "@/lib/types";
import { INDIAN_STATE_OPTIONS } from "@/lib/indianStates";

export function InstituteDetailsTab() {
  const [profile, setProfile] = useState<InstituteProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  useEffect(() => {
    apiFetch<InstituteProfile>("/org")
      .then((p) => {
        setProfile(p);
        setName(p.name);
        setEmail(p.email ?? "");
        setPhone(p.phone ?? "");
        setAddress(p.address ?? "");
        setCity(p.city ?? "");
        setState(p.state ?? "");
      })
      .catch(() => setError("Could not load institute details."));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch("/org", {
        method: "PATCH",
        body: JSON.stringify({ name, email: email || undefined, phone: phone || undefined, address: address || undefined, city: city || undefined, state: state || undefined }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await apiDownload("/org/export", `institute-export-${profile?.code ?? "data"}.zip`);
    } catch (err) {
      setExportError(err instanceof ApiClientError ? err.message : "Could not export your data.");
    } finally {
      setExporting(false);
    }
  }

  if (!profile) {
    return error ? (
      <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
    ) : (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge tone="primary">{profile.code}</Badge>
        <Badge tone={profile.isActive ? "success" : "danger"}>{profile.isActive ? "Active" : "Inactive"}</Badge>
        {profile.planName && <Badge tone="accent">{profile.planName} plan</Badge>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Institute name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Dropdown label="State" value={state} onChange={setState} options={INDIAN_STATE_OPTIONS} placeholder="Select state…" />
        <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>

      {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
      {saved && <div className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">Saved.</div>}

      <Button type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </form>

      {/* changes-phase14.md §14.2 — a full copy of this institute's own
          records: students, fee installments, payments, attendance,
          payroll. For peace of mind, or in case of ever leaving the
          platform — read-only, no data changes here. */}
      <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Export your data</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Download a full copy of your students, fees, attendance and payroll records as a zip of CSV files.
          </p>
        </div>
        <Button variant="secondary" onClick={handleExport} disabled={exporting} className="shrink-0">
          {exporting && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <path d="M21 12a9 9 0 11-9-9" strokeLinecap="round" />
            </svg>
          )}
          {exporting ? "Preparing…" : "Export"}
        </Button>
      </div>
      {exportError && (
        <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{exportError}</div>
      )}
    </div>
  );
}
