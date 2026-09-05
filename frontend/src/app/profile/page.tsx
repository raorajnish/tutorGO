"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="truncate text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</p>
        <h1 className="font-display mt-1 text-3xl font-bold text-foreground">Profile</h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-xl font-semibold text-accent-foreground">
            {user.fullName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-foreground">{user.fullName}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone="primary">{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-5 divide-y divide-border border-t border-border">
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="Phone" value={user.phone ?? "—"} />
          {user.institute && <InfoRow label="Institute" value={user.institute.name} />}
          {user.organization && <InfoRow label="Organization" value={user.organization.name} />}
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-foreground">Security</p>
        <div className="space-y-3">
          <ChangePasswordCard />
          <SignOutEverywhereCard />
          {user.mfaEligible && <TwoFactorCard enabled={user.mfaEnabled} />}
        </div>
      </div>
    </div>
  );
}

function SignOutEverywhereCard() {
  const { logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (
      !window.confirm(
        "Sign out of all devices? This immediately signs out every session on this account, including this one — you'll need to log in again here too."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/logout-everywhere", { method: "POST" });
      logout();
      router.replace("/login");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not sign out other sessions.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Sessions</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Signed in somewhere you don&apos;t recognise? Sign out everywhere at once.</p>
        </div>
        <Button variant="secondary" onClick={handleClick} disabled={busy}>
          {busy ? "Signing out…" : "Sign out of all devices"}
        </Button>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>
      )}
    </div>
  );
}

function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setOpen(false);
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update your password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Password</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Change the password used to sign in.</p>
        </div>
        {!open && (
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            Change
          </Button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 border-t border-border pt-4">
          <PasswordInput
            id="currentPassword"
            label="Current password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <PasswordInput
            id="newPassword"
            label="New password"
            required
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <PasswordInput
            id="confirmPassword"
            label="Confirm new password"
            required
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
          {success && (
            <div className="rounded-lg border border-success/30 bg-success-soft px-3.5 py-2.5 text-sm text-success">
              Password updated.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Update password"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

type MfaStep = "idle" | "scan" | "confirm" | "backupCodes" | "disable";

/** changes-phase12.md §12.6 — opt-in for every staff role (this card only
 * renders at all when user.mfaEligible). Four states in one card rather than
 * separate pages: idle → scan (QR + manual secret) → confirm (6-digit code)
 * → backupCodes (shown once), or idle → disable (current password). */
function TwoFactorCard({ enabled: initiallyEnabled }: { enabled: boolean }) {
  const { refresh } = useAuth();
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [step, setStep] = useState<MfaStep>("idle");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manualSecret, setManualSecret] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep("idle");
    setCode("");
    setCurrentPassword("");
    setError(null);
  }

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ qrDataUrl: string; secret: string }>("/auth/mfa/setup", { method: "POST" });
      setQrDataUrl(res.qrDataUrl);
      setManualSecret(res.secret);
      setStep("scan");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not start setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ backupCodes: string[] }>("/auth/mfa/confirm", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setBackupCodes(res.backupCodes);
      setStep("backupCodes");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  function finishSetup() {
    setEnabled(true);
    reset();
    refresh();
  }

  async function disable(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ currentPassword }) });
      setEnabled(false);
      reset();
      refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not disable two-factor authentication.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
            <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Enabled" : "Off"}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {enabled ? "An authenticator app code is required to sign in." : "Add an extra step when signing in, using an authenticator app."}
          </p>
        </div>
        {step === "idle" && (
          <Button variant="secondary" disabled={busy} onClick={() => (enabled ? setStep("disable") : startSetup())}>
            {busy ? "Working…" : enabled ? "Disable" : "Enable"}
          </Button>
        )}
      </div>

      {error && step === "idle" && (
        <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>
      )}

      {step === "scan" && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <p className="text-sm text-foreground">Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, …).</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally-generated data URL, not a remote image Next can optimize */}
          <img src={qrDataUrl} alt="Scan with your authenticator app" className="mx-auto h-48 w-48 rounded-lg border border-border" />
          <p className="text-center text-xs text-muted-foreground">
            Can&apos;t scan? Enter this code manually: <span className="font-mono font-medium text-foreground">{manualSecret}</span>
          </p>
          <form onSubmit={confirmSetup} className="space-y-3">
            <Input
              id="mfaSetupCode"
              label="6-digit code"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
            {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Verifying…" : "Verify & enable"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {step === "backupCodes" && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-2.5 text-sm text-warning">
            Save these backup codes somewhere safe. Each works once, and this is the only time they&apos;ll be shown — if you lose your
            phone, they&apos;re the only way back in.
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 font-mono text-sm text-foreground">
            {backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Button className="w-full" onClick={finishSetup}>
            I&apos;ve saved these
          </Button>
        </div>
      )}

      {step === "disable" && (
        <form onSubmit={disable} className="mt-4 space-y-4 border-t border-border pt-4">
          <PasswordInput
            id="mfaDisablePassword"
            label="Current password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          {error && <div className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? "Disabling…" : "Disable two-factor authentication"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
