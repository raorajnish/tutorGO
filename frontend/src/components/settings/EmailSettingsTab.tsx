"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { InstituteEmailConfig } from "@/lib/types";

export function EmailSettingsTab() {
  const [existing, setExisting] = useState<InstituteEmailConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<InstituteEmailConfig | null>("/org/email-config")
      .then((cfg) => {
        if (!cfg) return;
        setExisting(cfg);
        setHost(cfg.host);
        setPort(String(cfg.port));
        setSecure(cfg.secure);
        setUsername(cfg.username);
        setFromName(cfg.fromName);
        setFromEmail(cfg.fromEmail);
        setIsEnabled(cfg.isEnabled);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const cfg = await apiFetch<InstituteEmailConfig>("/org/email-config", {
        method: "PUT",
        body: JSON.stringify({ host, port: Number(port), secure, username, password: password || undefined, fromName, fromEmail, isEnabled }),
      });
      setExisting(cfg);
      setPassword("");
      setSuccess("Email settings saved.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save email settings.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-xl space-y-6">
      <p className="text-sm text-muted-foreground">
        Send outgoing email (payroll payment notifications, staff invites) from your own address
        instead of TutorGO&apos;s shared one. Optional — leave this off and everything keeps
        working via the platform default.
      </p>

      {existing && !existing.isEnabled && (
        <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          Saved but turned off — email is still going out via the platform default.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-(--shadow-card)">
        <label className="flex items-center gap-2 text-sm font-medium text-foreground">
          <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} className="h-4 w-4 accent-accent" />
          Send email from our own address
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="SMTP host" required value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
          <Input label="Port" required type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="h-4 w-4 accent-accent" />
          Use TLS/SSL (secure connection)
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="SMTP username" required value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input
            label="SMTP password"
            required={!existing}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={existing ? "Leave blank to keep current password" : ""}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="From name" required value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your institute's name" />
          <Input label="From email" required type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
        </div>

        {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
        {success && <div className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">{success}</div>}

        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </div>
  );
}
