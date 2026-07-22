"use client";
// src/app/(app)/exchanges/page.tsx
// AlgoFin v2 — Phase H: Multi-Exchange support
//
// Shows exchange picker with live/coming-soon status.
// Only Binance is fully live; Bybit, OKX, Coinbase show "Coming Soon".
// Billing consent is MANDATORY for all live exchanges.

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

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

interface ExchangeDef {
  id: string;
  name: string;
  display_name: string;
  status: "live" | "coming_soon";
  markets: string[];
  requires_passphrase: boolean;
  logo_letter: string;
  description: string;
  api_docs_url: string;
}

// ── Billing consent text (locked — plan.md Section 9) ────────────
const CONSENT_TEXT =
  "AlgoFin calculates and displays an estimated performance fee of 20% of my " +
  "monthly realized profit from this Binance Futures account for beta evaluation " +
  "purposes. This is not a charge. All manual trades on this account are included " +
  "regardless of whether AlgoFin placed them.";

// ── Exchange logo placeholder ─────────────────────────────────────
function ExchangeLogo({ letter, live }: { letter: string; live: boolean }) {
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0 ${
      live
        ? "bg-primary/15 border border-primary/25 text-primary"
        : "bg-white/5 border border-white/10 text-muted-foreground"
    }`}>
      {letter}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === "live") return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
      Live
    </span>
  );
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
      Coming Soon
    </span>
  );
}

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

// ── Connected account card ────────────────────────────────────────
function AccountCard({
  account, onSync, onRevoke, loading,
}: {
  account: ExchangeAccount;
  onSync: (id: string) => void;
  onRevoke: (id: string) => void;
  loading: boolean;
}) {
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString() : "Never";

  const exchangeLabels: Record<string, string> = {
    binance_usdtm:     "Binance USDT-M Futures",
    bybit_linear:      "Bybit Linear Perpetuals",
    okx_swap:          "OKX Perpetual Swaps",
    coinbase_advanced: "Coinbase Advanced Trade",
  };

  return (
    <div className="surface-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <p className="font-semibold text-foreground truncate">{account.label}</p>
            <SyncBadge status={account.sync_status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {exchangeLabels[account.exchange_id] || account.exchange_id} · Last synced: {fmt(account.last_sync_at)}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`w-1.5 h-1.5 rounded-full ${account.billing_consent ? "bg-emerald-400" : "bg-rose-400"}`} />
          {account.billing_consent ? "Fee tracking on" : "No consent"}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button onClick={() => onSync(account.id)} disabled={loading}
          className="flex-1 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-muted-foreground
            hover:border-white/20 hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50">
          Force sync
        </button>
        <button onClick={() => onRevoke(account.id)} disabled={loading}
          className="py-1.5 px-3 rounded-lg border border-rose-500/20 text-xs font-medium text-rose-400
            hover:bg-rose-500/10 hover:border-rose-500/40 transition-all disabled:opacity-50">
          Revoke
        </button>
      </div>
    </div>
  );
}

// ── Billing consent modal ─────────────────────────────────────────
function ConsentModal({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg glass-strong rounded-2xl border border-white/10 shadow-2xl p-6 space-y-5 animate-fade-up">
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

        <div className="bg-surface-1 rounded-xl border border-white/8 p-4 text-sm leading-relaxed text-foreground/90">
          {CONSENT_TEXT}
        </div>

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

        <label className="flex items-start gap-3 cursor-pointer group">
          <div
            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
              accepted ? "bg-primary border-primary" : "border-white/20 group-hover:border-primary/50"
            }`}
            onClick={() => setAccepted(p => !p)} role="checkbox" aria-checked={accepted}
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

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-muted-foreground
              hover:border-white/20 hover:text-foreground transition-all">
            Cancel
          </button>
          <button onClick={onAgree} disabled={!accepted}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
              hover:bg-primary/90 transition-all glow-cyan-sm disabled:opacity-40 disabled:cursor-not-allowed">
            I agree — connect account
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Connect form ─────────────────────────────────────────────────
function ConnectForm({
  exchange,
  onConnected,
  onCancel,
}: {
  exchange: ExchangeDef;
  onConnected: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"form" | "consent" | "connecting">("form");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!label.trim()) e.label = "Account label is required";
    if (!apiKey.trim()) e.apiKey = "API key is required";
    if (!apiSecret.trim()) e.apiSecret = "API secret is required";
    if (exchange.requires_passphrase && !passphrase.trim()) e.passphrase = "Passphrase is required";
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
        exchange_id: exchange.id,
        label: label.trim(),
        api_key: apiKey.trim(),
        api_secret: apiSecret.trim(),
        passphrase: passphrase.trim() || null,
        billing_consent: {
          consented: true,
          consent_version: "v1.0",
          consent_text: CONSENT_TEXT,
        },
      });
      onConnected();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setApiError(typeof detail === "string" ? detail : "Failed to connect account. Check your API key and secret.");
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
        <ConsentModal onAgree={handleConsentAgree} onCancel={() => setStep("form")} />
      )}

      <div className="bg-surface-1 border border-white/8 rounded-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ExchangeLogo letter={exchange.logo_letter} live={exchange.status === "live"} />
            <div>
              <h2 className="font-semibold text-foreground">Connect {exchange.name}</h2>
              <p className="text-xs text-muted-foreground">{exchange.display_name}</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-4">
          {apiError && (
            <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
              {apiError}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Account label</label>
            <input value={label} onChange={e => { setLabel(e.target.value); setErrors(p => ({ ...p, label: "" })); }}
              placeholder={`e.g. My ${exchange.name} Account`} className={fieldClass("label")} />
            {errors.label && <p className="text-xs text-rose-400">{errors.label}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">{exchange.name} API Key</label>
            <input value={apiKey} onChange={e => { setApiKey(e.target.value); setErrors(p => ({ ...p, apiKey: "" })); }}
              placeholder={`Paste your ${exchange.name} API key`} className={fieldClass("apiKey")} autoComplete="off" />
            {errors.apiKey && <p className="text-xs text-rose-400">{errors.apiKey}</p>}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium">API Secret</label>
            <input type="password" value={apiSecret} onChange={e => { setApiSecret(e.target.value); setErrors(p => ({ ...p, apiSecret: "" })); }}
              placeholder="Paste your API secret" className={fieldClass("apiSecret")} autoComplete="off" />
            {errors.apiSecret && <p className="text-xs text-rose-400">{errors.apiSecret}</p>}
          </div>

          {exchange.requires_passphrase && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium">API Passphrase</label>
              <input type="password" value={passphrase} onChange={e => { setPassphrase(e.target.value); setErrors(p => ({ ...p, passphrase: "" })); }}
                placeholder="Paste your API passphrase" className={fieldClass("passphrase")} autoComplete="off" />
              {errors.passphrase && <p className="text-xs text-rose-400">{errors.passphrase}</p>}
            </div>
          )}

          {/* API docs link */}
          {exchange.api_docs_url && (
            <a href={exchange.api_docs_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
              </svg>
              How to create {exchange.name} API keys
            </a>
          )}

          {/* Security note */}
          <div className="px-4 py-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Security</p>
            <ul className="space-y-0.5 list-disc pl-3">
              <li>Enable <strong>Read-only</strong> permissions only — AlgoFin never places trades without your explicit approval</li>
              <li>Restrict access to trusted IPs for extra security</li>
              <li>Your credentials are encrypted with AES-256 and never shown again</li>
            </ul>
          </div>

          <button type="submit" disabled={step === "connecting"}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
              hover:bg-primary/90 transition-all glow-cyan-sm
              disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {step === "connecting" ? (
              <>
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Connecting…
              </>
            ) : "Connect account"}
          </button>
        </form>
      </div>
    </>
  );
}

// ── Exchange picker card ──────────────────────────────────────────
function ExchangeCard({
  exchange,
  connectedCount,
  onSelect,
}: {
  exchange: ExchangeDef;
  connectedCount: number;
  onSelect: (ex: ExchangeDef) => void;
}) {
  const isLive = exchange.status === "live";

  return (
    <div className={`bg-surface-1 border rounded-2xl p-5 space-y-3 transition-all ${
      isLive ? "border-white/8 hover:border-white/16 cursor-pointer" : "border-white/5 opacity-70"
    }`}
      onClick={() => isLive && onSelect(exchange)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ExchangeLogo letter={exchange.logo_letter} live={isLive} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">{exchange.name}</h3>
              <StatusBadge status={exchange.status} />
            </div>
            <p className="text-xs text-muted-foreground">{exchange.markets.join(" · ")}</p>
          </div>
        </div>
        {connectedCount > 0 && (
          <span className="text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
            {connectedCount} connected
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{exchange.description}</p>

      <div className="pt-1">
        {isLive ? (
          <button
            onClick={e => { e.stopPropagation(); onSelect(exchange); }}
            className="w-full py-2 rounded-xl bg-primary/10 text-primary border border-primary/20 text-sm font-medium
              hover:bg-primary/20 transition-all"
          >
            + Connect {exchange.name} account
          </button>
        ) : (
          <div className="w-full py-2 rounded-xl bg-white/3 border border-white/8 text-sm text-muted-foreground text-center">
            Integration coming soon — check back later
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ExchangesPage() {
  const [accounts, setAccounts]       = useState<ExchangeAccount[]>([]);
  const [exchanges, setExchanges]     = useState<ExchangeDef[]>([]);
  const [loading, setLoading]         = useState(true);
  const showSkeleton                  = useDelayedLoading(loading);
  const [actionLoading, setActionLoading] = useState(false);
  const [connecting, setConnecting]   = useState<ExchangeDef | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await api.get<{ data: ExchangeAccount[] }>("/exchanges");
      setAccounts(res.data.data);
      setError(null);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401) {
        // Token expired and refresh failed — redirect to login
        window.location.href = "/login";
        return;
      }
      setError(
        detail
          ? `${detail} (${status})`
          : `Failed to load exchange accounts (${status ?? "network error"}).`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExchanges = useCallback(async () => {
    try {
      const res = await api.get<{ data: ExchangeDef[] }>("/exchanges/supported");
      setExchanges(res.data.data);
    } catch { /* registry always returns 200 */ }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchExchanges();
  }, [fetchAccounts, fetchExchanges]);

  const handleSync = async (id: string) => {
    setActionLoading(true);
    try { await api.post(`/exchanges/${id}/sync`, { sync_type: "full" }); await fetchAccounts(); }
    catch { /* ignore */ } finally { setActionLoading(false); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this exchange account? Billing consent will also be removed.")) return;
    setActionLoading(true);
    try { await api.delete(`/exchanges/${id}`); await fetchAccounts(); }
    catch { /* ignore */ } finally { setActionLoading(false); }
  };

  const handleConnected = async () => {
    setConnecting(null);
    setLoading(true);
    await fetchAccounts();
  };

  // Count connected accounts per exchange
  const countByExchange = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.exchange_id] = (acc[a.exchange_id] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Exchange Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your exchange accounts to start tracking performance and placing orders.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Connect form (shown when an exchange is selected) */}
      {connecting && (
        <ConnectForm
          exchange={connecting}
          onConnected={handleConnected}
          onCancel={() => setConnecting(null)}
        />
      )}

      {/* Connected accounts */}
      {!loading && (showSkeleton ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="surface-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="skeleton h-10 w-10 rounded-xl" />
                <div className="space-y-2">
                  <div className="skeleton h-4 w-36" />
                  <div className="skeleton h-3 w-24" />
                </div>
                <div className="skeleton h-5 w-16 rounded-full ml-auto" />
              </div>
              <div className="skeleton h-8 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : accounts.length > 0 ? (
        <div className="space-y-3 animate-fade-in">
          <h2 className="text-sm font-semibold text-foreground">Connected accounts ({accounts.length})</h2>
          {accounts.map(acct => (
            <AccountCard key={acct.id} account={acct}
              onSync={handleSync} onRevoke={handleRevoke} loading={actionLoading} />
          ))}
        </div>
      ) : null)}

      {/* Exchange picker — gate on !loading so connected counts are accurate */}
      {!loading && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <h2 className="text-base font-semibold text-foreground">Supported Exchanges</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click a live exchange to connect. Coming Soon exchanges will be enabled in future updates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(exchanges.length > 0 ? exchanges : [
              // Fallback if API call fails — hardcoded to always show the grid
              { id: "binance_usdtm",     name: "Binance",  display_name: "Binance USDT-M Futures",   status: "live",        markets: ["USDT-M Futures"], requires_passphrase: false, logo_letter: "B", description: "The world's largest crypto exchange. Connect your USDT-M Futures account.", api_docs_url: "" },
              { id: "bybit_linear",      name: "Bybit",    display_name: "Bybit Linear Perpetuals",   status: "coming_soon", markets: ["USDT Perpetuals"], requires_passphrase: false, logo_letter: "Y", description: "Bybit Linear Perpetuals. Full integration coming soon.", api_docs_url: "" },
              { id: "okx_swap",          name: "OKX",      display_name: "OKX Perpetual Swaps",       status: "coming_soon", markets: ["USDT Perpetuals"], requires_passphrase: true,  logo_letter: "O", description: "OKX Perpetual Swaps (USDT-settled). Integration coming soon.", api_docs_url: "" },
              { id: "coinbase_advanced",  name: "Coinbase", display_name: "Coinbase Advanced Trade",   status: "coming_soon", markets: ["Spot"],            requires_passphrase: false, logo_letter: "C", description: "Coinbase Advanced Trade (spot). API integration coming soon.", api_docs_url: "" },
            ] as ExchangeDef[]).map(ex => (
              <ExchangeCard
                key={ex.id}
                exchange={ex}
                connectedCount={countByExchange[ex.id] || 0}
                onSelect={setConnecting}
              />
            ))}
          </div>
        </div>
      )}

      {/* Skeleton for exchange picker while loading */}
      {loading && showSkeleton && (
        <div className="space-y-4">
          <div className="skeleton h-5 w-44" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="surface-card p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="skeleton h-10 w-10 rounded-xl" />
                  <div className="space-y-1.5">
                    <div className="skeleton h-4 w-32" />
                    <div className="skeleton h-3 w-20" />
                  </div>
                </div>
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-3/4" />
                <div className="skeleton h-8 w-28 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
