"use client";
// src/app/(auth)/forgot-password/page.tsx
// AlgoFin v1 — Forgot Password Request & 6-Digit Verification Flow

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import api from "@/lib/api";

type ResetStep = "email" | "code" | "password" | "success";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<ResetStep>("email");

  // Form State
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Token store
  const [resetToken, setResetToken] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);

  // Status
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Step 1: Request Code ──────────────────────────────────────────
  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email address is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{
        success: boolean;
        data: { message: string; reset_token?: string };
      }>("/auth/forgot-password", { email: trimmedEmail });

      if (res.data.data.reset_token) {
        setResetToken(res.data.data.reset_token);
        // Try decoding demo code payload if present
        try {
          const parts = res.data.data.reset_token.split(".");
          if (parts[1]) {
            const payload = JSON.parse(atob(parts[1]));
            if (payload.code) setDemoCode(payload.code);
          }
        } catch { /* ignore */ }
      }

      setStep("code");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Failed to send reset code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Verify 6-Digit Code ──────────────────────────────────
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("6-digit verification code is required");
      return;
    }

    // Demo check matching if code was embedded or direct verification
    if (demoCode && trimmedCode !== demoCode) {
      setError("Incorrect verification code. Please check your email.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{
        success: boolean;
        data: { message: string; reset_token: string };
      }>("/auth/verify-reset-code", {
        email: email.trim(),
        code: trimmedCode,
        token: resetToken,
      });

      if (res.data.data.reset_token) {
        setResetToken(res.data.data.reset_token);
      }
      setStep("password");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Incorrect 6-digit verification code. Please check your email."
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Reset Password ────────────────────────────────────────
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword) {
      setError("New password is required");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError("Password must contain at least one lowercase letter");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one digit");
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?`~]/.test(newPassword)) {
      setError("Password must contain at least one special character");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await api.post("/auth/reset-password", {
        token: resetToken,
        new_password: newPassword,
      });

      setStep("success");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Failed to reset password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-8 space-y-6 border border-white/8">
      {/* ── STEP 1: REQUEST EMAIL ────────────────────────────────── */}
      {step === "email" && (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">Reset password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your email address to receive your 6-digit reset code
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400 flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRequestCode} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface-1 border border-white/8 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none"
              />
            </div>

            <button
              id="get-reset-code-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
                hover:bg-primary/90 active:scale-[0.98] transition-all glow-cyan-sm
                disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Sending code…
                </>
              ) : (
                "Get reset code"
              )}
            </button>

            <p className="text-sm text-center text-muted-foreground pt-2">
              Remember your password?{" "}
              <Link
                href="/login"
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </form>
        </>
      )}

      {/* ── STEP 2: VERIFY CODE ─────────────────────────────────── */}
      {step === "code" && (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">Enter verification code</h1>
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400 flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {demoCode && (
            <div className="p-3.5 rounded-xl bg-surface-1 border border-primary/20 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Demo Code:</span>
              <span className="font-mono font-bold text-primary tracking-widest text-sm">{demoCode}</span>
            </div>
          )}

          <form onSubmit={handleVerifyCode} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="code" className="block text-sm font-medium text-foreground">
                6-digit verification code
              </label>
              <input
                id="code"
                type="text"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full px-3.5 py-3 rounded-xl text-center font-mono font-bold text-xl tracking-[0.4em] bg-surface-1 border border-white/8 text-foreground placeholder:text-muted-foreground/30 focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none"
              />
            </div>

            <button
              id="verify-code-submit"
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
                hover:bg-primary/90 active:scale-[0.98] transition-all glow-cyan-sm
                disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Verifying code…
                </>
              ) : (
                "Verify Code"
              )}
            </button>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
              <button
                type="button"
                onClick={() => setStep("email")}
                className="hover:text-foreground transition-colors"
              >
                ← Change email
              </button>
              <button
                type="button"
                onClick={handleRequestCode}
                className="text-primary hover:underline"
              >
                Resend code
              </button>
            </div>
          </form>
        </>
      )}

      {/* ── STEP 3: RESET PASSWORD ───────────────────────────────── */}
      {step === "password" && (
        <>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">Create new password</h1>
            <p className="text-sm text-muted-foreground">
              Choose a strong password for your AlgoFin account
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400 flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="newPassword" className="block text-sm font-medium text-foreground">
                New Password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface-1 border border-white/8 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface-1 border border-white/8 text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all outline-none"
              />
            </div>

            <button
              id="reset-password-submit"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
                hover:bg-primary/90 active:scale-[0.98] transition-all glow-cyan-sm
                disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Updating password…
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        </>
      )}

      {/* ── STEP 4: SUCCESS ───────────────────────────────────────── */}
      {step === "success" && (
        <div className="space-y-5 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">Password reset complete</h1>
            <p className="text-sm text-muted-foreground">
              Your password has been updated. You can now sign in with your new password.
            </p>
          </div>

          <button
            onClick={() => router.push("/login")}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-cyan-sm"
          >
            Sign in →
          </button>
        </div>
      )}
    </div>
  );
}
