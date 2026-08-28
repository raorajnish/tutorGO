"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Toggle } from "@/components/ui/Toggle";
import type { InstituteWhatsAppConfig, WhatsAppTemplate, WhatsAppTemplateStatus } from "@/lib/types";

const STATUS_TONE: Record<WhatsAppTemplateStatus, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

export function WhatsAppSettingsTab() {
  const [existing, setExisting] = useState<InstituteWhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templatesBusy, setTemplatesBusy] = useState(false);

  function loadConfig() {
    return apiFetch<InstituteWhatsAppConfig | null>("/org/whatsapp/config").then((cfg) => {
      setExisting(cfg);
      if (cfg) {
        setPhoneNumberId(cfg.phoneNumberId);
        setWabaId(cfg.wabaId);
        setBusinessAccountId(cfg.businessAccountId ?? "");
        setIsEnabled(cfg.isEnabled);
      }
    });
  }

  function loadTemplates() {
    return apiFetch<WhatsAppTemplate[]>("/org/whatsapp/templates").then(setTemplates);
  }

  useEffect(() => {
    Promise.all([loadConfig(), loadTemplates()]).finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const cfg = await apiFetch<InstituteWhatsAppConfig>("/org/whatsapp/config", {
        method: "PUT",
        body: JSON.stringify({
          accessToken: accessToken || undefined,
          phoneNumberId,
          wabaId,
          businessAccountId: businessAccountId || undefined,
          // First-time connect turns itself on — the toggle above is disabled
          // until a config exists, so there'd otherwise be no way to reach it.
          // Once connected, re-saving (e.g. rotating the token) preserves
          // whatever the toggle is currently set to.
          isEnabled: existing ? isEnabled : true,
        }),
      });
      setExisting(cfg);
      setIsEnabled(cfg.isEnabled);
      setAccessToken("");
      setSuccess("WhatsApp settings saved and verified.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save WhatsApp settings.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleEnabled(next: boolean) {
    setError(null);
    setSuccess(null);
    setToggling(true);
    try {
      const cfg = await apiFetch<InstituteWhatsAppConfig>("/org/whatsapp/config/toggle", {
        method: "PATCH",
        body: JSON.stringify({ isEnabled: next }),
      });
      setExisting(cfg);
      setIsEnabled(cfg.isEnabled);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the WhatsApp switch.");
    } finally {
      setToggling(false);
    }
  }

  async function handleTestConnection() {
    setError(null);
    setSuccess(null);
    setTesting(true);
    try {
      const res = await apiFetch<{ ok: true; verifiedName: string; displayPhoneNumber: string }>("/org/whatsapp/config/test", { method: "POST" });
      setSuccess(`Connected — ${res.verifiedName} (${res.displayPhoneNumber})`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSuggestTemplates() {
    setTemplatesBusy(true);
    setError(null);
    try {
      setTemplates(await apiFetch<WhatsAppTemplate[]>("/org/whatsapp/templates/suggest", { method: "POST" }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not generate suggested templates.");
    } finally {
      setTemplatesBusy(false);
    }
  }

  async function handleSyncTemplates() {
    setTemplatesBusy(true);
    setError(null);
    try {
      await apiFetch("/org/whatsapp/templates/sync", { method: "POST" });
      await loadTemplates();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not sync templates from Meta.");
    } finally {
      setTemplatesBusy(false);
    }
  }

  async function handleSubmitTemplate(id: string) {
    setTemplatesBusy(true);
    setError(null);
    try {
      await apiFetch(`/org/whatsapp/templates/${id}/submit`, { method: "POST" });
      await loadTemplates();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not submit this template to Meta.");
    } finally {
      setTemplatesBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connect your institute&apos;s own WhatsApp Business Account (WABA) to send fee reminders, lecture
          updates, and admission links over WhatsApp. Optional — nothing sends until this is configured and
          switched on.
        </p>

        <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-(--shadow-card)">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">WhatsApp features</span>
              <Badge tone={existing ? "success" : "neutral"}>{existing ? "Connected" : "Not connected"}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {existing
                ? existing.isEnabled
                  ? "On — messages will send once the sending features below are wired up."
                  : "Off — no WhatsApp messages will be sent, even once wired up."
                : "Connect your WABA below to turn this on."}
            </p>
          </div>
          <Toggle checked={isEnabled} onChange={handleToggleEnabled} disabled={!existing || toggling} label="Enable WhatsApp features" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-(--shadow-card)">
          <Input
            label="Access token"
            required={!existing}
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={existing ? "Leave blank to keep current token" : "Permanent System User token from Meta"}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Phone number ID" required value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
            <Input label="WhatsApp Business Account ID" required value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
          </div>

          <Input
            label="Business account ID (optional)"
            value={businessAccountId}
            onChange={(e) => setBusinessAccountId(e.target.value)}
          />

          {error && <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
          {success && <div className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">{success}</div>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save & verify"}
            </Button>
            {existing && (
              <Button type="button" variant="secondary" onClick={handleTestConnection} disabled={testing}>
                {testing ? "Testing…" : "Test connection"}
              </Button>
            )}
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Message templates</h3>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleSuggestTemplates} disabled={templatesBusy}>
              Generate suggestions
            </Button>
            <Button type="button" variant="secondary" onClick={handleSyncTemplates} disabled={templatesBusy || !existing}>
              Sync from Meta
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          WhatsApp only sends pre-approved templates, not freeform text. Generate drafts matched to the messages
          this app sends (fee reminders, lecture updates), submit each one to Meta for review, then wait for
          approval — usually within a day.
        </p>

        {templates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No templates yet — click &quot;Generate suggestions&quot; to draft some.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {templates.map((t) => (
              <div key={t.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-foreground">{t.name}</span>
                    <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                  </div>
                  {t.status === "DRAFT" && (
                    <Button type="button" variant="secondary" onClick={() => handleSubmitTemplate(t.id)} disabled={templatesBusy || !existing}>
                      Submit for approval
                    </Button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{t.bodyText}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
