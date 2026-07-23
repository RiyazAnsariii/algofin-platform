"use client";
// src/app/(auth)/forgot-password/page.tsx
// AlgoFin v1 — Forgot Password Request Page

import Link from "next/link";
import { useState } from "react";
import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{
        success: boolean;
        data: { message: string; reset_token?: string };
      }>("/auth/forgot-password", { email: email.trim() });

      setSubmitted(true);
      if (res.data.data.reset_token) {
        setResetToken(res.data.data.reset_token);
      }
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Failed to process request. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-8 space-y-6 border border-white/8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Reset password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email to receive password reset instructions
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400 flex items-start gap-2">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {submitted ? (
        <div className="space-y-5">
          <div className="px-4 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-base">
              <span>✉️</span> Reset link requested
            </div>
            <p className="text-xs leading-relaxed text-emerald-300/90">
              If an account exists for <span className="font-medium text-white">{email}</span>, a password reset token has been issued.
            </p>
          </div>

          {resetToken && (
            <div className="p-4 rounded-xl bg-surface-1 border border-primary/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  🔑 Demo Reset Token
                </span>
                <span className="text-[10px] text-muted-foreground">Expires in 15 mins</span>
              </div>
              <p className="text-xs font-mono bg-background p-2.5 rounded-lg border border-white/5 text-muted-foreground break-all select-all">
                {resetToken}
              </p>
              <Link
                href={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5"
              >
                Proceed to Reset Password →
              </Link>
            </div>
          )}

          <div className="pt-2 flex flex-col gap-3">
            {!resetToken && (
              <Link
                href="/reset-password"
                className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-foreground hover:bg-white/10 text-center transition-all"
              >
                I already have a reset token
              </Link>
            )}
            <Link
              href="/login"
              className="text-sm text-center text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to Sign in
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
            id="forgot-submit"
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
              hover:bg-primary/90 active:scale-[0.98] transition-all glow-cyan-sm
              disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Sending reset token…
              </>
            ) : (
              "Send Reset Token"
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
      )}
    </div>
  );
}
