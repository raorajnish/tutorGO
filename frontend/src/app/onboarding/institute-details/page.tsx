"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { OnboardingLayout } from "@/components/onboarding/OnboardingLayout";
import { nextOnboardingRoute } from "@/lib/onboarding";
import { INDIAN_STATE_OPTIONS } from "@/lib/indianStates";
import type { InstituteProfile } from "@/lib/types";

export default function InstituteDetailsPage() {
  const { user, refresh } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<InstituteProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    const target = nextOnboardingRoute(user);
    if (target !== "/onboarding/institute-details") router.replace(target);
  }, [user, router]);

  useEffect(() => {
    apiFetch<InstituteProfile>("/org")
      .then((p) => {
        setProfile(p);
        setPhone(p.phone ?? "");
        setEmail(p.email ?? "");
        setAddress(p.address ?? "");
        setCity(p.city ?? "");
        setState(p.state ?? "");
      })
      .catch(() => setError("Could not load institute details."))
      .finally(() => setLoadingProfile(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!phone.trim() || !email.trim() || !address.trim() || !city.trim() || !state.trim()) {
      setError("All fields are required.");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/org/onboarding-complete", {
        method: "POST",
        body: JSON.stringify({ phone, email, address, city, state }),
      });
      await refresh();
      router.replace("/onboarding/welcome");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save institute details.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <OnboardingLayout
      stepLabel="Step 2 of 3"
      title="Tell us about your institute."
      description="A few contact details so students, staff and platform notices reach the right place."
      bullets={[
        "Used on receipts, notices and staff invites",
        "You can update these any time from Settings",
        "Takes less than a minute",
      ]}
    >
      <h2 className="text-xl font-semibold text-foreground">Institute details</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {profile ? `For ${profile.name}` : "Complete your institute's profile"}
      </p>

      {profile && (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Institute name</p>
            <p className="font-medium text-foreground">{profile.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Institute code</p>
            <p className="font-medium text-foreground">{profile.code}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="phone"
            label="Phone"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
            disabled={loadingProfile}
          />
          <Input
            id="email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="institute@example.com"
            disabled={loadingProfile}
          />
        </div>

        <Input
          id="address"
          label="Address"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={loadingProfile}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input id="city" label="City" required value={city} onChange={(e) => setCity(e.target.value)} disabled={loadingProfile} />
          <Dropdown
            label="State"
            value={state}
            onChange={setState}
            options={INDIAN_STATE_OPTIONS}
            placeholder="Select state…"
            disabled={loadingProfile}
          />
        </div>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={submitting || loadingProfile}>
          {submitting ? "Saving…" : "Continue"}
        </Button>
      </form>
    </OnboardingLayout>
  );
}
