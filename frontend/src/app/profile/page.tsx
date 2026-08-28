"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
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
          <TwoFactorCard />
        </div>
      </div>
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

function TwoFactorCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">Two-factor authentication</p>
            <Badge tone="neutral">Coming soon</Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">Add an extra step when signing in.</p>
        </div>
        <Button variant="secondary" disabled>
          Enable
        </Button>
      </div>
    </div>
  );
}
