"use client";
// src/app/(app)/exchanges/page.tsx
// AlgoFin v1 — Exchange accounts: list connected + connect new
//
// Billing consent is MANDATORY — displayed as modal before form submission.
// Exact consent text from plan.md Section 9.
// Dual-record rule is enforced on the backend.

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────
interface ExchangeAccount {
  id: string;
  label: string;
  exchange_id: string;
  sync_status: "pending" | "connected" | "syncing" | "error" | "stale";
  billing_consent: boolean;
  last_sync_at: string | null;
  billing_consent_at: string | null;
  created_at: string;
}

// ── Billing consent text (locked — plan.md Section 9) ────────────
const CONSENT_TEXT =
  "AlgoFin calculates and displays an estimated performance fee of 20% of my " +
  "monthly realized profit from this Binance Futures account for beta evaluation " +
  "purposes. This is not a charge. All manual trades on this account are included " +
  "regardless of whether AlgoFin placed them.";

// ── Sync status badge ─────────────────────────────────────────────
function SyncBadge({ status }: { status: ExchangeAccount["sync_status"] }) {
  const map = {
    connected: { cls: "badge-connected", label: "Connected" },
    syncing:   { cls: "badge-connected", label: "Syncing…" },
    pending:   { cls: "badge-pending",   label: "Pending" },
    error:     { cls: "badge-error",     label: "Error" },
    stale:     { cls: "badge-stale",     label: "Stale" },
  } as const;
  const { cls, label } = map[status] ?? map.pending;
  return (
    <span className={cls}>
      <span className={status === "connected" || status === "syncing" ? "pulse-dot w-1.5 h-1.5" : "w-1.5 h-1.5 rounded-full bg-current"} />
      {label}
    </span>
  );
}

// ── Account card ─────────────────────────────────────────────────
function AccountCard({
  account,
  onSync,
  onRevoke,
  loading,
}: {
  account: ExchangeAccount;
  onSync: (id: string) => void;
  onRevoke: (id: string) => void;
  loading: boolean;
}) {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : "Never";

  return (
    <div className="surface-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="font-semibold text-foreground truncate">{account.label}</p>
            <SyncBadge status={account.sync_status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Binance USDT-M Futures · Last synced: {fmt(account.last_sync_at)}
          </p>
        </div>
        {/* Billing consent indicator */}
        <div className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`w-1.5 h-1.5 rounded-full ${account.billing_consent ? "bg-emerald-400" : "bg-rose-400"}`} />
          {account.billing_consent ? "Fee tracking on" : "No consent"}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onSync(account.id)}
          disabled={loading}
          className="flex-1 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-muted-foreground
            hover:border-white/20 hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
        >
          Force sync
        </button>
        <button
          onClick={() => onRevoke(account.id)}
          disabled={loading}
          className="py-1.5 px-3 rounded-lg border border-rose-500/20 text-xs font-medium text-rose-400
            hover:bg-rose-500/10 hover:border-rose-500/40 transition-all disabled:opacity-50"
        >
          Revoke
        </button>
      </div>
    </div>
  );
}

// ── Billing consent modal ─────────────────────────────────────────
function ConsentModal({
  onAgree,
  onCancel,
}: {
  onAgree: () => void;
  onCancel: () => void;
}) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg glass-strong rounded-2xl border border-white/10 shadow-2xl p-6 space-y-5 animate-fade-up">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <h2 className="text-lg font-semibold">Estimated monthly fee — consent required</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Before connecting, please read and accept the billing terms for this account.
          </p>
        </div>

        {/* Consent text box — exact wording from plan.md Section 9 */}
        <div className="bg-surface-1 rounded-xl border border-white/8 p-4 text-sm leading-relaxed text-foreground/90">
          {CONSENT_TEXT}
        </div>

        {/* Key points */}
        <ul className="space-y-2 text-sm">
          {[
            "20% of profitable months only — zero fee in loss months",
            "This is an estimate displayed for transparency — no payment collected during beta",
            "All your manual trades are included — AlgoFin doesn't need to place them",
            "You can revoke this account at any time",
          ].map((point) => (
            <li key={point} className="flex items-start gap-2 text-muted-foreground">
              <span className="mt-0.5 text-primary shrink-0">✓</span>
              {point}
            </li>
          ))}
        </ul>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <div
            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all
              ${accepted
                ? "bg-primary border-primary"
                : "border-white/20 group-hover:border-primary/50"
              }`}
            onClick={() => setAccepted((p) => !p)}
            role="checkbox"
            aria-checked={accepted}
          >
            {accepted && (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" />
              </svg>
            )}
          </div>
          <span className="text-sm text-muted-foreground leading-snug">
            I understand and agree to the estimated fee terms described above.
          </span>
        </label>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-muted-foreground
              hover:border-white/20 hover:text-foreground transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onAgree}
            disabled={!accepted}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
              hover:bg-primary/90 transition-all glow-cyan-sm
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            I agree — connect account
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Connect form ─────────────────────────────────────────────────
function ConnectForm({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [step, setStep] = useState<"form" | "consent" | "connecting">("form");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!label.trim()) e.label = "Account label is required";
    if (!apiKey.trim()) e.apiKey = "API key is required";
    if (!apiSecret.trim()) e.apiSecret = "API secret is required";
    return e;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setStep("consent");
  };

  const handleConsentAgree = async () => {
    setStep("connecting");
    setApiError(null);
    try {
      await api.post("/exchanges/connect", {
        exchange_id: "binance_usdtm",
        label: label.trim(),
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
        billing_consent: {
          consented: true,
          consent_version: "v1.0",
          consent_text: CONSENT_TEXT,
        },
      });
      onConnected();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setApiError(
        typeof detail === "string" ? detail : "Failed to connect account. Check your API key and secret."
      );
      setStep("form");
    }
  };

  const fieldClass = (key: string) => `
    w-full px-3.5 py-2.5 rounded-xl text-sm bg-surface-1 border transition-all outline-none
    text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-primary/30
    ${errors[key] ? "border-rose-500/50" : "border-white/8 focus:border-primary/50"}
  `;

  return (
    <>
      {step === "consent" && (
        <ConsentModal
          onAgree={handleConsentAgree}
          onCancel={() => setStep("form")}
        />
      )}

      <form onSubmit={handleFormSubmit} className="space-y-4">
        {apiError && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
            {apiError}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Account label</label>
          <input
            value={label}
            onChange={(e) => { setLabel(e.target.value); setErrors((p) => ({ ...p, label: "" })); }}
            placeholder="e.g. My Futures Account"
            className={fieldClass("label")}
          />
          {errors.label && <p className="text-xs text-rose-400">{errors.label}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">Binance API key</label>
          <input
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setErrors((p) => ({ ...p, apiKey: "" })); }}
            placeholder="Paste your Binance API key"
            className={fieldClass("apiKey")}
            autoComplete="off"
          />
          {errors.apiKey && <p className="text-xs text-rose-400">{errors.apiKey}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium">API secret</label>
          <input
            type="password"
            value={apiSecret}
            onChange={(e) => { setApiSecret(e.target.value); setErrors((p) => ({ ...p, apiSecret: "" })); }}
            placeholder="Paste your API secret"
            className={fieldClass("apiSecret")}
            autoComplete="off"
          />
          {errors.apiSecret && <p className="text-xs text-rose-400">{errors.apiSecret}</p>}
        </div>

        {/* Security note */}
        <div className="px-4 py-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Security</p>
          <ul className="space-y-0.5 list-disc pl-3">
            <li>AlgoFin only needs <strong>Futures Read</strong> permission</li>
            <li>Enable <strong>Restrict access to trusted IPs</strong> for extra security</li>
            <li>Your credentials are encrypted with AES-256 and never shown again</li>
            <li>AlgoFin cannot execute trades on your behalf</li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={step === "connecting"}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
            hover:bg-primary/90 transition-all glow-cyan-sm
            disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {step === "connecting" ? (
            <>
              <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              Connecting…
            </>
          ) : (
            "Connect account"
          )}
        </button>
      </form>
    </>
  );
}

// ── Main page ────────────────────────────────────────────────────
export default function ExchangesPage() {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await api.get<{ data: ExchangeAccount[] }>("/exchanges/");
      setAccounts(res.data.data);
      if (res.data.data.length === 0) setShowForm(true);
    } catch {
      setError("Failed to load exchange accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleSync = async (id: string) => {
    setActionLoading(true);
    try {
      await api.post(`/exchanges/${id}/sync`, { sync_type: "full" });
      await fetchAccounts();
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this exchange account? Billing consent will also be removed.")) return;
    setActionLoading(true);
    try {
      await api.delete(`/exchanges/${id}`);
      await fetchAccounts();
    } catch { /* ignore */ }
    finally { setActionLoading(false); }
  };

  const handleConnected = async () => {
    setShowForm(false);
    setLoading(true);
    await fetchAccounts();
  };

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Exchange Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your Binance USDT-M Futures account to start tracking.
          </p>
        </div>
        {accounts.length > 0 && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium
              hover:bg-primary/90 transition-all glow-cyan-sm"
          >
            <span className="text-lg leading-none">+</span>
            Connect
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Connected accounts */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="surface-card p-5 animate-pulse">
              <div className="h-4 w-48 bg-muted rounded mb-2" />
              <div className="h-3 w-32 bg-muted/60 rounded" />
            </div>
          ))}
        </div>
      ) : accounts.length > 0 ? (
        <div className="space-y-3">
          {accounts.map((acct) => (
            <AccountCard
              key={acct.id}
              account={acct}
              onSync={handleSync}
              onRevoke={handleRevoke}
              loading={actionLoading}
            />
          ))}
        </div>
      ) : null}

      {/* Connect form */}
      {showForm && (
        <div className="surface-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">Connect Binance Futures</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Read-only access · USDT-M Futures only
              </p>
            </div>
            {accounts.length > 0 && (
              <button
                onClick={() => setShowForm(false)}
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                ✕
              </button>
            )}
          </div>
          <ConnectForm onConnected={handleConnected} />
        </div>
      )}

      {/* Empty state */}
      {!loading && accounts.length === 0 && !showForm && (
        <div className="surface-card p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">No exchange accounts connected</p>
          <p className="text-xs text-muted-foreground">Connect your Binance Futures account to start tracking.</p>
        </div>
      )}
    </div>
  );
}
