"use client";
// src/app/(auth)/reset-password/page.tsx
// AlgoFin v1 — Reset Password Submission Page

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import api from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [errors, setErrors] = useState<{
    token?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  const validate = () => {
    const errs: typeof errors = {};
    if (!token.trim()) errs.token = "Reset token is required";

    if (!newPassword) {
      errs.newPassword = "New password is required";
    } else if (newPassword.length < 8) {
      errs.newPassword = "Password must be at least 8 characters";
    } else if (!/[A-Z]/.test(newPassword)) {
      errs.newPassword = "Must contain at least one uppercase letter";
    } else if (!/[a-z]/.test(newPassword)) {
      errs.newPassword = "Must contain at least one lowercase letter";
    } else if (!/[0-9]/.test(newPassword)) {
      errs.newPassword = "Must contain at least one digit";
    } else if (!/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?`~]/.test(newPassword)) {
      errs.newPassword = "Must contain at least one special character";
    }

    if (!confirmPassword) {
      errs.confirmPassword = "Please confirm your new password";
    } else if (newPassword && newPassword !== confirmPassword) {
      errs.confirmPassword = "Passwords do not match";
    }

    return errs;
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
      await api.post("/auth/reset-password", {
        token: token.trim(),
        new_password: newPassword,
      });

      setSuccess(true);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setApiError(
        typeof detail === "string"
          ? detail
          : "Failed to reset password. Token may be invalid or expired."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-8 space-y-6 border border-white/8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Set new password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your reset token and choose a new password
        </p>
      </div>

      {apiError && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400 flex items-start gap-2">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>{apiError}</span>
        </div>
      )}

      {success ? (
        <div className="space-y-5">
          <div className="px-4 py-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 space-y-2 text-center">
            <div className="text-3xl mb-1">🎉</div>
            <p className="font-semibold text-base">Password reset successfully!</p>
            <p className="text-xs text-emerald-300/80">
              Your password has been updated. All active sessions have been revoked for your security.
            </p>
          </div>

          <button
            onClick={() => router.push("/login")}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-all glow-cyan-sm"
          >
            Sign in with New Password →
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Token input */}
          <div className="space-y-1.5">
            <label htmlFor="token" className="block text-sm font-medium text-foreground">
              Reset token
            </label>
            <textarea
              id="token"
              rows={2}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setErrors((p) => ({ ...p, token: undefined }));
              }}
              placeholder="Paste your reset token here"
              className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono bg-surface-1 border transition-all outline-none text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30 ${
                errors.token ? "border-rose-500/50" : "border-white/8 focus:border-primary/50"
              }`}
            />
            {errors.token && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5">
                <span>⚠</span> {errors.token}
              </p>
            )}
          </div>

          {/* New Password */}
          <div className="space-y-1.5">
            <label htmlFor="newPassword" className="block text-sm font-medium text-foreground">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setErrors((p) => ({ ...p, newPassword: undefined }));
              }}
              placeholder="••••••••"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface-1 border transition-all outline-none text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30 ${
                errors.newPassword ? "border-rose-500/50" : "border-white/8 focus:border-primary/50"
              }`}
            />
            {errors.newPassword && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5">
                <span>⚠</span> {errors.newPassword}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrors((p) => ({ ...p, confirmPassword: undefined }));
              }}
              placeholder="••••••••"
              className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface-1 border transition-all outline-none text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30 ${
                errors.confirmPassword ? "border-rose-500/50" : "border-white/8 focus:border-primary/50"
              }`}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-rose-400 flex items-center gap-1.5">
                <span>⚠</span> {errors.confirmPassword}
              </p>
            )}
          </div>

          <button
            id="reset-submit"
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
              hover:bg-primary/90 active:scale-[0.98] transition-all glow-cyan-sm
              disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Resetting password…
              </>
            ) : (
              "Update Password"
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
