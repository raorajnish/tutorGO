"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface EmailConfigResponse {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromName: string;
  fromEmail: string;
  updatedAt: string;
}

export default function EmailSettingsPage() {
  const [existing, setExisting] = useState<EmailConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("TutorGO");
  const [fromEmail, setFromEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<EmailConfigResponse | null>("/platform/email-config")
      .then((cfg) => {
        if (!cfg) return;
        setExisting(cfg);
        setHost(cfg.host);
        setPort(String(cfg.port));
        setSecure(cfg.secure);
        setUsername(cfg.username);
        setFromName(cfg.fromName);
        setFromEmail(cfg.fromEmail);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const cfg = await apiFetch<EmailConfigResponse>("/platform/email-config", {
        method: "PUT",
        body: JSON.stringify({
          host,
          port: Number(port),
          secure,
          username,
          password,
          fromName,
          fromEmail,
        }),
      });
      setExisting(cfg);
      setPassword("");
      setSuccess("SMTP settings saved. New invite emails will use this transport.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save SMTP settings.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Email settings</h1>
        <p className="text-sm text-muted-foreground">
          One SMTP transport for the whole platform — used to deliver owner and staff invite
          credentials. Without this configured, temp passwords are shown inline for manual
          handover instead of emailed.
        </p>
      </div>

      {!existing && (
        <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          SMTP isn&apos;t configured yet — invite emails aren&apos;t being sent.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-(--shadow-card)">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="SMTP host" required value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.gmail.com" />
          <Input label="Port" required type="number" value={port} onChange={(e) => setPort(e.target.value)} placeholder="587" />
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} className="accent-(--primary)" />
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
          <Input label="From name" required value={fromName} onChange={(e) => setFromName(e.target.value)} />
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
