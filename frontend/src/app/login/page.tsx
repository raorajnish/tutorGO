"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const invited = searchParams.get("email") !== null;
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      {/* Brand / visual panel */}
      <div className="tg-mesh relative hidden flex-col justify-between overflow-hidden p-12 xl:p-16 lg:flex">
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-card/15 text-base font-bold text-primary-foreground backdrop-blur-sm">
            T
          </div>
          <span className="font-display text-lg font-semibold text-primary-foreground">TutorGO</span>
        </div>

        <div className="relative max-w-md">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-foreground/70">
            You can easily
          </p>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-tight text-primary-foreground xl:text-5xl">
            Run your institute end-to-end, from enquiry to payroll.
          </h1>
        </div>

        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-primary-foreground/60">
          <span>Enquiries</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <span>Admissions</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <span>Attendance</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <span>Fees</span>
          <span className="h-1 w-1 rounded-full bg-primary-foreground/30" />
          <span>Payroll</span>
        </div>

        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-white/5" aria-hidden="true" />
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
              T
            </div>
            <span className="font-display text-lg font-semibold text-foreground">TutorGO</span>
          </div>

          <span className="hidden text-2xl text-accent lg:inline" aria-hidden="true">
            ✦
          </span>
          <h2 className="font-display mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
            {invited ? "You're invited" : "Welcome back"}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {invited
              ? "Enter the temporary password from your invite email to sign in and set up your account."
              : "Sign in to your institute workspace. Admissions, attendance, fees and payroll — all in one place."}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Input
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@institute.com"
            />

            <div className="space-y-1.5">
              <PasswordInput
                id="password"
                label="Password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <div className="text-right">
                <Link href="/login/forgot-password" className="text-xs font-medium text-accent hover:opacity-80">
                  Forgot password?
                </Link>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                {error}
              </div>
            )}

            <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">
            TutorGO accounts are invite-only. If you don&apos;t have credentials yet, ask your
            institute owner or platform administrator to invite you.
          </p>
        </div>
      </div>
    </div>
  );
}

