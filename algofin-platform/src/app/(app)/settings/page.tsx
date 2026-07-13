"use client";
// src/app/(app)/settings/page.tsx
// AlgoFin v1 — Settings (Phase F)
// Profile, password change, danger zone (account deletion)

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";
import type { User } from "@/types";

// ── Section wrapper ───────────────────────────────────────────────
function Section({
  title,
  description,
  children,
  danger = false,
}: {
  title:       string;
  description: string;
  children:    React.ReactNode;
  danger?:     boolean;
}) {
  return (
    <div className={`surface-card overflow-hidden ${danger ? "border-rose-500/20" : ""}`}>
      <div className={`px-5 py-4 border-b ${danger ? "border-rose-500/20 bg-rose-500/4" : "border-white/6"}`}>
        <h2 className={`text-sm font-semibold ${danger ? "text-rose-400" : "text-foreground"}`}>{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ── Field ─────────────────────────────────────────────────────────
function Field({
  id, label, type = "text", value, onChange, error, readOnly, placeholder,
}: {
  id: string; label: string; type?: string; value: string;
  onChange?: (v: string) => void; error?: string;
  readOnly?: boolean; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        className={`w-full px-3.5 py-2.5 rounded-xl text-sm transition-all outline-none
          ${readOnly
            ? "bg-surface-2/50 border border-white/5 text-muted-foreground cursor-not-allowed"
            : `bg-surface-1 border text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30
              ${error ? "border-rose-500/50" : "border-white/8 focus:border-primary/50"}`
          }`}
      />
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────
function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border
      ${type === "success"
        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
        : "bg-rose-500/15 border-rose-500/30 text-rose-400"
      } animate-fade-up`}
    >
      {type === "success" ? "✓" : "⚠"} {message}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const { user, setUser, logout } = useAuthStore();

  // Profile form
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErrors, setProfileErrors] = useState<{ fullName?: string }>({});

  // Password form
  const [currPass, setCurrPass]     = useState("");
  const [newPass, setNewPass]       = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passErrors, setPassErrors] = useState<Record<string, string>>({});

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Sync store → form when user loads
  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
  }, [user]);

  // ── Profile save ──────────────────────────────────────────────
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof profileErrors = {};
    if (!fullName.trim()) errs.fullName = "Name is required";
    if (Object.keys(errs).length) { setProfileErrors(errs); return; }

    setProfileLoading(true);
    try {
      const res = await api.patch<{ data: User }>("/auth/me", {
        full_name: fullName.trim(),
      });
      setUser(res.data.data);
      showToast("Profile updated successfully.");
    } catch (err: any) {
      showToast(err?.response?.data?.detail ?? "Failed to update profile.", "error");
    } finally {
      setProfileLoading(false);
    }
  };

  // ── Password change ───────────────────────────────────────────
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!currPass)              errs.currPass    = "Current password is required";
    if (!newPass)               errs.newPass     = "New password is required";
    else if (newPass.length < 8) errs.newPass    = "Must be at least 8 characters";
    if (newPass !== confirmPass) errs.confirmPass = "Passwords do not match";
    if (Object.keys(errs).length) { setPassErrors(errs); return; }

    setPassLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currPass,
        new_password:     newPass,
      });
      setCurrPass(""); setNewPass(""); setConfirmPass("");
      setPassErrors({});
      showToast("Password changed successfully.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      showToast(
        typeof detail === "string" ? detail : "Failed to change password.",
        "error"
      );
    } finally {
      setPassLoading(false);
    }
  };

  // ── Delete account ────────────────────────────────────────────
  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Are you sure? This will permanently delete your account, all exchange connections, and billing history. This cannot be undone."
    );
    if (!confirmed) return;

    const typed = window.prompt('Type "DELETE" to confirm:');
    if (typed !== "DELETE") return;

    try {
      await api.delete("/auth/me");
      logout();
      router.replace("/");
    } catch (err: any) {
      showToast(err?.response?.data?.detail ?? "Failed to delete account.", "error");
    }
  };

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* Account info (read-only) */}
      <Section title="Account" description="Your AlgoFin account information">
        <Field
          id="email-readonly"
          label="Email address"
          value={user?.email ?? ""}
          readOnly
        />
        <p className="text-xs text-muted-foreground">
          Email cannot be changed during beta.
        </p>
      </Section>

      {/* Profile */}
      <Section title="Profile" description="Update your display name">
        <form onSubmit={handleProfileSave} className="space-y-4">
          <Field
            id="full-name"
            label="Full name"
            value={fullName}
            onChange={(v) => { setFullName(v); setProfileErrors({}); }}
            error={profileErrors.fullName}
            placeholder="Your name"
          />
          <button
            type="submit"
            disabled={profileLoading}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
              hover:bg-primary/90 transition-all glow-cyan-sm
              disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {profileLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Saving…
              </>
            ) : "Save changes"}
          </button>
        </form>
      </Section>

      {/* Password */}
      <Section title="Password" description="Change your account password">
        <form onSubmit={handlePasswordChange} className="space-y-4" noValidate>
          <Field
            id="current-password"
            label="Current password"
            type="password"
            value={currPass}
            onChange={(v) => { setCurrPass(v); setPassErrors((p) => ({ ...p, currPass: "" })); }}
            error={passErrors.currPass}
            placeholder="••••••••"
          />
          <Field
            id="new-password"
            label="New password"
            type="password"
            value={newPass}
            onChange={(v) => { setNewPass(v); setPassErrors((p) => ({ ...p, newPass: "" })); }}
            error={passErrors.newPass}
            placeholder="At least 8 characters"
          />
          <Field
            id="confirm-password"
            label="Confirm new password"
            type="password"
            value={confirmPass}
            onChange={(v) => { setConfirmPass(v); setPassErrors((p) => ({ ...p, confirmPass: "" })); }}
            error={passErrors.confirmPass}
            placeholder="Repeat new password"
          />
          <button
            type="submit"
            disabled={passLoading}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
              hover:bg-primary/90 transition-all glow-cyan-sm
              disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {passLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Updating…
              </>
            ) : "Change password"}
          </button>
        </form>
      </Section>

      {/* About */}
      <Section title="About AlgoFin" description="Version and beta information">
        <div className="space-y-2 text-sm">
          {[
            ["Version",        "v1.0.0 (beta)"],
            ["Exchange",       "Binance USDT-M Futures only"],
            ["AI model",       "Gemini 2.0 Flash"],
            ["Data source",    "Binance API via CCXT"],
            ["Fee structure",  "20% of realized profit (display only)"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{k}</span>
              <span className="text-foreground font-medium">{v}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone" description="Irreversible account actions" danger>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Delete account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently remove your account, all exchange connections, and billing history.
            </p>
          </div>
          <button
            onClick={handleDeleteAccount}
            className="shrink-0 px-4 py-2 rounded-xl border border-rose-500/30 text-rose-400 text-sm font-medium
              hover:bg-rose-500/10 hover:border-rose-500/50 transition-all"
          >
            Delete account
          </button>
        </div>
      </Section>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
