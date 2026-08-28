"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiClientError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import type { VerifyOtpResponse, ResetPasswordResponse } from "@/lib/types";

type Step = "email" | "otp" | "password";

const RESEND_COOLDOWN_SECONDS = 30;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { loginWithToken } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function requestOtp(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setDigits(Array(6).fill(""));
      setStep("otp");
      startCooldown();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const code = digits.join("");
    if (code.length !== 6) {
      setError("Enter the full 6-digit code.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch<VerifyOtpResponse>("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      setResetToken(res.resetToken);
      setStep("password");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "That code is invalid or has expired.");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(e: FormEvent) {
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
      const res = await apiFetch<ResetPasswordResponse>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ resetToken, newPassword, confirmPassword }),
      });
      await loginWithToken(res.token);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reset your password.");
    } finally {
      setSubmitting(false);
    }
  }

  function onDigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      setDigits((prev) => prev.map((d, i) => (i === index ? "" : d)));
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean[clean.length - 1]!;
      return next;
    });
    const el = document.getElementById(`otp-${index + 1}`);
    if (el instanceof HTMLInputElement) el.focus();
  }

  function onDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      const el = document.getElementById(`otp-${index - 1}`);
      if (el instanceof HTMLInputElement) el.focus();
    }
  }

  function onDigitPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? "";
      return next;
    });
    const lastIndex = Math.min(pasted.length, 6) - 1;
    const el = document.getElementById(`otp-${Math.max(lastIndex, 0)}`);
    if (el instanceof HTMLInputElement) el.focus();
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">T</div>
          <span className="font-display text-lg font-semibold text-foreground">TutorGO</span>
        </div>

        {step === "email" && (
          <>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Reset your password</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Enter your account email and we&apos;ll send you a 6-digit code.</p>
            <form onSubmit={requestOtp} className="mt-7 space-y-4">
              <Input
                id="email"
                label="Email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@institute.com"
              />
              {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
              <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Send code"}
              </Button>
            </form>
          </>
        )}

        {step === "otp" && (
          <>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Enter the code</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. It expires in 10 minutes.
            </p>
            <form onSubmit={verifyOtp} className="mt-7 space-y-4">
              <div className="flex justify-between gap-2">
                {digits.map((d, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    autoFocus={i === 0}
                    value={d}
                    onChange={(e) => onDigitChange(i, e.target.value)}
                    onKeyDown={(e) => onDigitKeyDown(i, e)}
                    onPaste={onDigitPaste}
                    className="h-14 w-11 rounded-xl border border-border bg-card text-center text-xl font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent sm:w-12"
                  />
                ))}
              </div>

              {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}

              <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
                {submitting ? "Verifying…" : "Verify code"}
              </Button>

              <button
                type="button"
                onClick={() => requestOtp()}
                disabled={cooldown > 0 || submitting}
                className="w-full text-center text-sm text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </button>
            </form>
          </>
        )}

        {step === "password" && (
          <>
            <h2 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">Choose a new password</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">You&apos;ll be signed in right after.</p>
            <form onSubmit={resetPassword} className="mt-7 space-y-4">
              <PasswordInput
                id="newPassword"
                label="New password"
                required
                autoFocus
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
              {error && <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</div>}
              <Button type="submit" variant="accent" className="w-full" disabled={submitting}>
                {submitting ? "Saving…" : "Reset password & sign in"}
              </Button>
            </form>
          </>
        )}

        <p className="mt-8 text-center text-xs text-muted-foreground">
          <Link href="/login" className="font-medium text-accent hover:opacity-80">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
