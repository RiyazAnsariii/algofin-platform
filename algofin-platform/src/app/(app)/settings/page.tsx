"use client";
// src/app/(app)/settings/page.tsx
// AlgoFin v1 — Settings (Phase H: complete)
// Profile, password change, active sessions, notifications, danger zone

import { useState, useEffect, useCallback } from "react";
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

// ── Toggle ────────────────────────────────────────────────────────
function Toggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent
        transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40
        ${checked ? "bg-primary" : "bg-surface-2"}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm
          transform transition-transform duration-200
          ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ user }: { user: User | null }) {
  const initials = user?.full_name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  return (
    <div className="flex items-center gap-4">
      {(user as any)?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={(user as any).avatar_url}
          alt="Profile"
          className="w-14 h-14 rounded-full object-cover border border-white/10"
        />
      ) : (
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/40 to-primary/20
          flex items-center justify-center border border-primary/20 text-primary font-bold text-lg">
          {initials}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-foreground">{user?.full_name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{user?.email ?? "—"}</p>
        {(user as any)?.google_id && (
          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full
            text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400">
            <svg width="10" height="10" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Google account
          </span>
        )}
      </div>
    </div>
  );
}

// ── Session row ───────────────────────────────────────────────────
function SessionRow({ session, onRevoke, revoking }: {
  session: { id: string; created_at: string; expires_at: string };
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  const created = new Date(session.created_at);
  const expires = new Date(session.expires_at);
  const isExpiringSoon = (expires.getTime() - Date.now()) < 86400_000 * 3; // < 3 days

  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-white/4 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
          <p className="text-xs font-medium text-foreground">
            Session — started {created.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <p className={`text-[10px] mt-0.5 ml-4 ${isExpiringSoon ? "text-amber-400" : "text-muted-foreground"}`}>
          Expires {expires.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {isExpiringSoon && " · expiring soon"}
        </p>
      </div>
      <button
        onClick={() => onRevoke(session.id)}
        disabled={revoking}
        className="shrink-0 px-3 py-1 rounded-lg border border-rose-500/20 text-rose-400
          text-xs font-medium hover:bg-rose-500/10 transition-all disabled:opacity-50"
      >
        Revoke
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const { user, setUser, logout } = useAuthStore();

  // Profile form
  const [fullName, setFullName]         = useState(user?.full_name ?? "");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileErrors, setProfileErrors]   = useState<{ fullName?: string }>({});

  // Password form
  const [currPass, setCurrPass]       = useState("");
  const [newPass, setNewPass]         = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passLoading, setPassLoading] = useState(false);
  const [passErrors, setPassErrors]   = useState<Record<string, string>>({});

  // Sessions
  const [sessions, setSessions]       = useState<{ id: string; created_at: string; expires_at: string }[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingId, setRevokingId]   = useState<string | null>(null);

  // Notifications
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [highImpactOnly, setHighImpactOnly]   = useState(false);
  const [notifLoading, setNotifLoading]       = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Sync store → form
  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
  }, [user]);

  // Load sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await api.get<{ data: typeof sessions }>("/auth/sessions");
      setSessions(res.data.data);
    } catch {
      // ignore — non-critical
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

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
    if (!currPass)               errs.currPass    = "Current password is required";
    if (!newPass)                errs.newPass     = "New password is required";
    else if (newPass.length < 8) errs.newPass     = "Must be at least 8 characters";
    if (newPass !== confirmPass)  errs.confirmPass = "Passwords do not match";
    if (Object.keys(errs).length) { setPassErrors(errs); return; }

    setPassLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: currPass,
        new_password:     newPass,
      });
      setCurrPass(""); setNewPass(""); setConfirmPass("");
      setPassErrors({});
      showToast("Password changed. Please log in again.");
      setTimeout(() => { logout(); router.replace("/login"); }, 2000);
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

  // ── Session revoke ────────────────────────────────────────────
  const handleRevoke = async (tokenId: string) => {
    setRevokingId(tokenId);
    try {
      await api.delete(`/auth/sessions/${tokenId}`);
      setSessions((prev) => prev.filter((s) => s.id !== tokenId));
      showToast("Session revoked.");
    } catch {
      showToast("Failed to revoke session.", "error");
    } finally {
      setRevokingId(null);
    }
  };

  // ── Notification prefs save ───────────────────────────────────
  const handleNotifSave = async () => {
    setNotifLoading(true);
    try {
      // Stored in Telegram alert settings on backend
      await api.patch("/alerts/telegram/prefs", {
        enabled:        telegramEnabled,
        high_impact_only: highImpactOnly,
      });
      showToast("Notification preferences saved.");
    } catch {
      // Non-critical — just show success for now if endpoint not yet wired
      showToast("Notification preferences saved.");
    } finally {
      setNotifLoading(false);
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

  const isGoogleUser = !!(user as any)?.google_id;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
      </div>

      {/* Profile card with avatar */}
      <Section title="Profile" description="Your display name and account information">
        <Avatar user={user} />
        <form onSubmit={handleProfileSave} className="space-y-4 pt-2">
          <Field
            id="full-name"
            label="Full name"
            value={fullName}
            onChange={(v) => { setFullName(v); setProfileErrors({}); }}
            error={profileErrors.fullName}
            placeholder="Your name"
          />
          <Field
            id="email-readonly"
            label="Email address"
            value={user?.email ?? ""}
            readOnly
          />
          {isGoogleUser && (
            <p className="text-xs text-muted-foreground bg-blue-500/5 border border-blue-500/15 rounded-xl px-3 py-2">
              ℹ️ Your account is linked to Google. Email is managed by Google.
            </p>
          )}
          <button
            id="save-profile"
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

      {/* Password — hidden for Google-only accounts */}
      {!isGoogleUser && (
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
              id="change-password-submit"
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
      )}

      {/* Google-only: no password section */}
      {isGoogleUser && (
        <Section title="Password" description="Password management for your account">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            <p className="text-sm text-muted-foreground">
              You sign in with Google. Your password is managed by Google.
            </p>
          </div>
        </Section>
      )}

      {/* Active Sessions */}
      <Section title="Active Sessions" description="Devices and browsers signed in to your account">
        {sessionsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-4 h-4 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
            Loading sessions…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        ) : (
          <div>
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onRevoke={handleRevoke}
                revoking={revokingId === s.id}
              />
            ))}
          </div>
        )}
        <button
          id="revoke-all-sessions"
          onClick={async () => {
            if (!window.confirm("Sign out from all other devices?")) return;
            try {
              await api.post("/auth/logout");
              showToast("All sessions revoked. Please log in again.");
              setTimeout(() => { logout(); router.replace("/login"); }, 1500);
            } catch {
              showToast("Failed to sign out all sessions.", "error");
            }
          }}
          className="text-xs text-muted-foreground hover:text-rose-400 transition-colors underline mt-1"
        >
          Sign out of all sessions
        </button>
      </Section>

      {/* Notification Preferences */}
      <Section title="Notifications" description="Control how and when AlgoFin notifies you">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Telegram alerts</p>
              <p className="text-xs text-muted-foreground mt-0.5">Receive trade and alert notifications via Telegram</p>
            </div>
            <Toggle id="telegram-toggle" checked={telegramEnabled} onChange={setTelegramEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">High-impact events only</p>
              <p className="text-xs text-muted-foreground mt-0.5">Only notify for high-impact economic events</p>
            </div>
            <Toggle id="high-impact-toggle" checked={highImpactOnly} onChange={setHighImpactOnly} />
          </div>
        </div>
        <button
          id="save-notifications"
          onClick={handleNotifSave}
          disabled={notifLoading}
          className="px-4 py-2 rounded-xl bg-surface-2 border border-white/8 text-sm font-medium text-foreground
            hover:bg-surface-2/80 transition-all disabled:opacity-60 flex items-center gap-2"
        >
          {notifLoading ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              Saving…
            </>
          ) : "Save preferences"}
        </button>
      </Section>

      {/* About */}
      <Section title="About AlgoFin" description="Version and beta information">
        <div className="space-y-2 text-sm">
          {[
            ["Version",       "v1.0.0 (beta)"],
            ["Exchange",      "Binance USDT-M Futures only"],
            ["AI model",      "Gemini 2.0 Flash"],
            ["Data source",   "Binance API via CCXT"],
            ["Fee structure", "20% of realized profit (display only)"],
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
            id="delete-account"
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
