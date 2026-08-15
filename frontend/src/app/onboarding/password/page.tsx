"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { nextOnboardingRoute } from "@/lib/onboarding";

export default function SetPasswordPage() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const totalSteps = user?.role === "ADMIN" ? 3 : 2;

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Already done with this step — skip straight to the next gate.
    if (user && !user.mustChangePassword) {
      router.replace(nextOnboardingRoute(user));
    }
  }, [user, router]);

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
        body: JSON.stringify({ newPassword }),
      });
      await refresh();
      if (user) router.replace(nextOnboardingRoute({ ...user, mustChangePassword: false }));
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "CURRENT_PASSWORD_REQUIRED") {
        // The account already finished this step (mustChangePassword is already
        // false server-side) — this page just hasn't caught up yet. Move on
        // instead of asking for a current password this redesigned form never
        // collects.
        await refresh();
        if (user) router.replace(nextOnboardingRoute({ ...user, mustChangePassword: false }));
        return;
      }
      setError(err instanceof ApiClientError ? err.message : "Could not update your password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout
      stepLabel={`Step 1 of ${totalSteps}`}
      title="Set a password only you know."
      description="You signed in with a temporary password from your invite email. Choose a new one to secure your account."
      bullets={["Pick a new password you'll remember", "You'll only need to do this once"]}
    >
      <h2 className="text-xl font-semibold text-foreground">Set your password</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user?.email}</span>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          id="newPassword"
          label="New password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <Input
          id="confirmPassword"
          label="Confirm new password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </form>
    </OnboardingLayout>
  );
}
