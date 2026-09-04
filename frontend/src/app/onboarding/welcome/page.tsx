"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { TermsModal } from "@/components/onboarding/TermsModal";
import { homeRoute, nextOnboardingRoute } from "@/lib/onboarding";

export default function WelcomePage() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const totalSteps = user?.role === "ADMIN" ? 3 : 2;

  const [termsOpen, setTermsOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const target = nextOnboardingRoute(user);
    if (target !== "/onboarding/welcome") router.replace(target);
  }, [user, router]);

  async function handleAgree() {
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/auth/accept-terms", { method: "POST" });
      await refresh();
      router.replace(homeRoute(user!));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not continue. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout
      stepLabel={`Step ${totalSteps} of ${totalSteps}`}
      title="Welcome to TutorGO."
      description="One last thing before your dashboard — a quick look at the terms your institute's workspace runs under."
      bullets={[
        "Your data stays isolated to your institute",
        "You control which staff can access what",
        "Module access follows your subscription",
      ]}
    >
      <h2 className="text-xl font-semibold text-foreground">
        Welcome{user ? `, ${user.fullName.split(" ")[0]}` : ""}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {user?.institute ? `${user.institute.name} is ready to go.` : "Your account is ready to go."}
      </p>

      <div className="mt-6 space-y-4">
        <label className="flex items-start gap-3 rounded-md border border-border bg-card p-4 text-sm text-foreground">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 accent-(--primary)"
          />
          <span>
            I agree to the{" "}
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="font-medium text-primary underline underline-offset-2"
            >
              Terms & Conditions
            </button>
          </span>
        </label>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <Button className="w-full" disabled={!agreed || submitting} onClick={handleAgree}>
          {submitting ? "Setting things up…" : "Agree & continue"}
        </Button>
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </OnboardingLayout>
  );
}
