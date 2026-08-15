"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
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

  if (!profile) {
    return error ? (
      <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
    ) : (
      <p className="text-sm text-muted-foreground">Loading…</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
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
  );
}
