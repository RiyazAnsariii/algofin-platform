"use client";
// src/app/(auth)/login/page.tsx
// AlgoFin v1 — Login page (Phase D: full form with real API)

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import type { User } from "@/types";

// Note: metadata must be in a server component; moved to layout.
// This page is "use client" — metadata is set in parent layout.

// ── Form field component ──────────────────────────────────────────
function FormField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  autoComplete,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`
          w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface-1
          border transition-all outline-none
          text-foreground placeholder:text-muted-foreground/50
          focus:ring-2 focus:ring-primary/30
          ${error
            ? "border-rose-500/50 focus:border-rose-500"
            : "border-white/8 focus:border-primary/50"
          }
        `}
      />
      {error && (
        <p className="text-xs text-rose-400 flex items-center gap-1.5">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

// ── Error banner ─────────────────────────────────────────────────
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400 flex items-start gap-2">
      <span className="mt-0.5 shrink-0">⚠</span>
      <span>{message}</span>
    </div>
  );
}

// Maps raw Google error codes to user-friendly messages
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied:         "You cancelled the Google sign-in. Please try again or use email/password.",
  token_exchange_failed: "Google sign-in failed — could not exchange the code for a token. Please try again.",
  userinfo_failed:       "Google sign-in failed — could not fetch your Google profile. Please try again.",
  missing_user_info:     "Google did not provide your email address. Please try again.",
  invalid_state:         "Google sign-in session expired. Please start again.",
  missing_params:        "Google sign-in failed — missing parameters. Please try again.",
};

export default function LoginPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { login }    = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Read ?error= from Google OAuth callback redirect
  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      setApiError(
        OAUTH_ERROR_MESSAGES[oauthError] ??
        `Sign-in failed: ${oauthError.replace(/_/g, " ")}`
      );
    }
  }, [searchParams]);

  const validate = () => {
    const e: { email?: string; password?: string } = {};
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";
    if (!password) e.password = "Password is required";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    try {
      const res = await api.post<{
        success: boolean;
        data: { access_token: string; user: User };
      }>("/auth/login", { email: email.trim(), password });

      login({
        access_token: res.data.data.access_token,
        user:         res.data.data.user,
      });

      router.replace("/dashboard");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setApiError(
        typeof detail === "string"
          ? detail
          : "Invalid email or password. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-8 space-y-6 border border-white/8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to your AlgoFin dashboard
        </p>
      </div>

      {/* Google OAuth button */}
      <a
        href="/api/v1/auth/google"
        className="flex items-center justify-center gap-3 w-full py-2.5 rounded-xl
          border border-white/10 bg-white/5 text-sm font-medium text-foreground
          hover:bg-white/10 hover:border-white/20 transition-all"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </a>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-xs text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-white/8" />
      </div>

      {apiError && <ErrorBanner message={apiError} />}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={(v) => { setEmail(v); setErrors((p) => ({ ...p, email: undefined })); }}
          placeholder="you@example.com"
          error={errors.email}
          autoComplete="email"
        />
        <div className="space-y-1">
          <FormField
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(v) => { setPassword(v); setErrors((p) => ({ ...p, password: undefined })); }}
            placeholder="••••••••"
            error={errors.password}
            autoComplete="current-password"
          />
          <div className="flex justify-end pt-0.5">
            <Link
              href="/forgot-password"
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <button
          id="login-submit"
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
            hover:bg-primary/90 active:scale-[0.98] transition-all glow-cyan-sm
            disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="text-sm text-center text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Create account
        </Link>
      </p>
    </div>
  );
}
