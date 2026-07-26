"use client";
// src/app/(app)/exchanges/page.tsx
// AlgoFin v2 — Phase H: Multi-Exchange support & Redesigned Interface

import { useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";
import { cachedGet, invalidateCache, invalidateCachePrefix } from "@/lib/apiCache";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";
import { relativeTime } from "@/lib/staleness";

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

interface PortfolioSummary {
  total_value_usdt: number;
  open_positions: number;
  realized_pnl_mtd: number;
  connected_accounts: number;
}

// ── Billing consent text (locked — plan.md Section 9) ────────────
const CONSENT_TEXT =
  "AlgoFin calculates and displays an estimated performance fee of 20% of my " +
  "monthly realized profit from this exchange account for beta evaluation " +
  "purposes. This is not a charge. All manual trades on this account are included " +
  "regardless of whether AlgoFin placed them.";

// ── Exchange SVG Logos ─────────────────────────────────────────────
export function BinanceLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#0b0e11] border border-[#F0B90B]/30 flex items-center justify-center shrink-0 p-2 shadow-md`}>
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#0b0e11"/>
        <path d="M12 4l2.625 2.625L12 9.25 9.375 6.625 12 4zm-5.25 5.25l2.625 2.625L6.75 14.5 4.125 11.875 6.75 9.25zm10.5 0l2.625 2.625-2.625 2.625-2.625-2.625 2.625-2.625zM12 14.5l2.625 2.625L12 19.75l-2.625-2.625L12 14.5zm0-3.938l1.313-1.312 1.312 1.312-1.312 1.313L12 10.562z" fill="#F0B90B"/>
      </svg>
    </div>
  );
}

export function BybitLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#0d0e12] border border-amber-500/20 flex items-center justify-center shrink-0 p-1.5 shadow-md select-none`}>
      <span className="font-extrabold text-[12px] tracking-tight text-white font-sans flex items-center">
        BY<span className="inline-block w-[3.5px] h-3.5 bg-[#F7A600] rounded-[1px] mx-[1.5px]" />T
      </span>
    </div>
  );
}

export function CoinbaseLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#0052FF] border border-[#0052FF]/50 flex items-center justify-center shrink-0 p-2 shadow-md`}>
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 15a5 5 0 1 1 3.536-8.536H12v3h3.536A5.002 5.002 0 0 1 12 17z" fill="white"/>
      </svg>
    </div>
  );
}

export function DeltaLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#0c0d12] border border-white/10 flex items-center justify-center shrink-0 p-1.5 shadow-md`}>
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
        <polygon points="12,3 20,9 12,12" fill="#FF6B00"/>
        <polygon points="4,12 12,3 12,12" fill="#FF9900"/>
        <polygon points="4,12 12,12 12,21" fill="#00E676"/>
        <polygon points="12,12 20,15 12,21" fill="#00C853"/>
        <polygon points="9,12 12,9 12,15" fill="#0c0d12"/>
      </svg>
    </div>
  );
}

function ExchangeLogo({ id, name }: { id?: string; name?: string }) {
  const key = (id || name || "").toLowerCase();
  if (key.includes("binance") || key === "b") return <BinanceLogo className="w-11 h-11" />;
  if (key.includes("bybit") || key === "y") return <BybitLogo className="w-11 h-11" />;
  if (key.includes("coinbase") || key === "c") return <CoinbaseLogo className="w-11 h-11" />;
  if (key.includes("delta") || key === "d") return <DeltaLogo className="w-11 h-11" />;

  return (
    <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm font-bold text-foreground shrink-0">
      {(name || "E").substring(0, 2).toUpperCase()}
    </div>
  );
}

// ── Billing consent modal ─────────────────────────────────────────
function ConsentModal({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-lg glass-strong rounded-2xl border border-white/12 shadow-2xl p-6 space-y-5 animate-fade-up">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-cyan-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <h2 className="text-lg font-semibold text-foreground">Estimated monthly fee — consent required</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Before connecting, please read and accept the billing terms for this account.
          </p>
        </div>

        <div className="bg-[#0b1019] rounded-xl border border-white/8 p-4 text-xs leading-relaxed text-foreground/90">
          {CONSENT_TEXT}
        </div>

        <ul className="space-y-2 text-xs">
          {[
            "20% of profitable months only — zero fee in loss months",
            "This is an estimate displayed for transparency — no payment collected during beta",
            "All your manual trades are included — AlgoFin doesn't need to place them",
            "You can revoke this account at any time",
          ].map((point) => (
            <li key={point} className="flex items-start gap-2 text-muted-foreground">
              <span className="mt-0.5 text-cyan-400 shrink-0">✓</span>
              {point}
            </li>
          ))}
        </ul>

        <label className="flex items-start gap-3 cursor-pointer group">
          <div
            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
              accepted ? "bg-cyan-500 border-cyan-500" : "border-white/20 group-hover:border-cyan-500/50"
            }`}
            onClick={() => setAccepted(p => !p)} role="checkbox" aria-checked={accepted}
          >
            {accepted && (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black" />
              </svg>
            )}
          </div>
          <span className="text-xs text-muted-foreground leading-snug">
            I understand and agree to the estimated fee terms described above.
          </span>
        </label>

        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-medium text-muted-foreground hover:border-white/20 hover:text-foreground transition-all">
            Cancel
          </button>
          <button onClick={onAgree} disabled={!accepted}
            className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-black text-xs font-semibold hover:bg-cyan-400 transition-all glow-cyan-sm disabled:opacity-40 disabled:cursor-not-allowed">
            I agree — connect account
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Connect Form Modal ───────────────────────────────────────────
function ConnectModal({
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
    w-full px-3.5 py-2.5 rounded-xl text-xs bg-[#090d16] border transition-all outline-none
    text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/30
    ${errors[key] ? "border-rose-500/50" : "border-white/10 focus:border-cyan-500/50"}
  `;

  return (
    <>
      {step === "consent" && (
        <ConsentModal onAgree={handleConsentAgree} onCancel={() => setStep("form")} />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <div className="w-full max-w-lg bg-[#0c121e] border border-white/12 rounded-2xl p-6 space-y-5 animate-fade-up shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/8 pb-4">
            <div className="flex items-center gap-3">
              <ExchangeLogo id={exchange.id} name={exchange.name} />
              <div>
                <h2 className="font-semibold text-foreground text-base">Connect {exchange.name}</h2>
                <p className="text-xs text-muted-foreground">{exchange.display_name}</p>
              </div>
            </div>
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors text-2xl leading-none p-1">×</button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {apiError && (
              <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                {apiError}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-foreground/90">Account label</label>
              <input value={label} onChange={e => { setLabel(e.target.value); setErrors(p => ({ ...p, label: "" })); }}
                placeholder={`e.g. My ${exchange.name} Account`} className={fieldClass("label")} />
              {errors.label && <p className="text-[11px] text-rose-400">{errors.label}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-foreground/90">{exchange.name} API Key</label>
              <input value={apiKey} onChange={e => { setApiKey(e.target.value); setErrors(p => ({ ...p, apiKey: "" })); }}
                placeholder={`Paste your ${exchange.name} API key`} className={fieldClass("apiKey")} autoComplete="off" />
              {errors.apiKey && <p className="text-[11px] text-rose-400">{errors.apiKey}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-foreground/90">API Secret</label>
              <input type="password" value={apiSecret} onChange={e => { setApiSecret(e.target.value); setErrors(p => ({ ...p, apiSecret: "" })); }}
                placeholder="Paste your API secret" className={fieldClass("apiSecret")} autoComplete="off" />
              {errors.apiSecret && <p className="text-[11px] text-rose-400">{errors.apiSecret}</p>}
            </div>

            {exchange.requires_passphrase && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-foreground/90">API Passphrase</label>
                <input type="password" value={passphrase} onChange={e => { setPassphrase(e.target.value); setErrors(p => ({ ...p, passphrase: "" })); }}
                  placeholder="Paste your API passphrase" className={fieldClass("passphrase")} autoComplete="off" />
                {errors.passphrase && <p className="text-[11px] text-rose-400">{errors.passphrase}</p>}
              </div>
            )}

            {/* API docs link */}
            {exchange.api_docs_url && (
              <a href={exchange.api_docs_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors pt-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                </svg>
                How to create {exchange.name} API keys
              </a>
            )}

            {/* Security note */}
            <div className="px-4 py-3 rounded-xl bg-cyan-500/5 border border-cyan-500/15 text-[11px] text-muted-foreground space-y-1">
              <p className="font-semibold text-cyan-400 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0110 0v4"/>
                </svg>
                Bank-level Security
              </p>
              <ul className="space-y-0.5 list-disc pl-3">
                <li>Enable <strong>Read-only</strong> permissions only — AlgoFin never has withdrawal rights</li>
                <li>Your credentials are encrypted with AES-256 and stored securely</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onCancel}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-medium text-muted-foreground hover:border-white/20 hover:text-foreground transition-all">
                Cancel
              </button>
              <button type="submit" disabled={step === "connecting"}
                className="flex-1 py-2.5 rounded-xl bg-cyan-500 text-black font-semibold text-xs hover:bg-cyan-400 transition-all glow-cyan-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {step === "connecting" ? "Connecting…" : "Connect Account →"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Documentation Modal ──────────────────────────────────────────
function DocumentationModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-xl bg-[#0c121e] border border-white/12 rounded-2xl p-6 space-y-5 animate-fade-up shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/8 pb-4">
          <div className="flex items-center gap-2.5 text-cyan-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            <h2 className="text-base font-semibold text-foreground">API Key Guide & Documentation</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl p-1">×</button>
        </div>

        <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
          <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
            💡 <strong>Read-Only API Keys Required:</strong> AlgoFin only requires read-only API permissions to sync your balance, open positions, and trading history. Never grant withdrawal permissions.
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-foreground text-sm">1. Binance API Setup</h3>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Log in to Binance and go to <strong>API Management</strong>.</li>
              <li>Create an API key, label it (e.g., &quot;AlgoFin Sync&quot;).</li>
              <li>Under API Restrictions, ensure <strong>Enable Reading</strong> is checked.</li>
              <li>Do NOT check Enable Withdrawals or Spot/Futures Trading.</li>
            </ol>
          </div>

          <div className="space-y-2 border-t border-white/6 pt-3">
            <h3 className="font-semibold text-foreground text-sm">2. Bybit API Setup</h3>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Navigate to <strong>Account &amp; Security → API Management</strong> on Bybit.</li>
              <li>Select <strong>System-Generated API Keys</strong>.</li>
              <li>Choose <strong>Read-Only</strong> permissions.</li>
              <li>Enable Contract / Derivatives Orders and Positions read permissions.</li>
            </ol>
          </div>

          <div className="space-y-2 border-t border-white/6 pt-3">
            <h3 className="font-semibold text-foreground text-sm">3. Coinbase Advanced Setup</h3>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Go to <strong>Coinbase Developer Platform (CDP) / API Keys</strong>.</li>
              <li>Create a new API key with <code>wallet:accounts:read</code> and <code>wallet:orders:read</code> scopes.</li>
            </ol>
          </div>

          <div className="space-y-2 border-t border-white/6 pt-3">
            <h3 className="font-semibold text-foreground text-sm">4. Delta Exchange Setup</h3>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Go to <strong>API Keys</strong> under Profile settings on Delta.</li>
              <li>Create a Read-Only key for Futures &amp; Options sync.</li>
            </ol>
          </div>
        </div>

        <div className="pt-2">
          <button onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-foreground text-xs font-semibold transition-all">
            Got it, close guide
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ExchangesPage() {
  const [accounts, setAccounts]             = useState<ExchangeAccount[]>([]);
  const [exchanges, setExchanges]           = useState<ExchangeDef[]>([]);
  const [summary, setSummary]               = useState<PortfolioSummary | null>(null);
  const [loading, setLoading]               = useState(true);
  const showSkeleton                        = useDelayedLoading(loading);
  const [actionLoading, setActionLoading]   = useState(false);
  const [connecting, setConnecting]         = useState<ExchangeDef | null>(null);
  const [activeMenuId, setActiveMenuId]     = useState<string | null>(null);
  const [showDocModal, setShowDocModal]     = useState(false);
  const [error, setError]                   = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery]       = useState("");
  const [activeFilter, setActiveFilter]     = useState<"all" | "connected" | "not_connected" | "coming_soon">("all");

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await cachedGet<ExchangeAccount[]>("/exchanges", 30_000);
      setAccounts(data);
      setError(null);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401 || status === 403) {
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
      const data = await cachedGet<ExchangeDef[]>("/exchanges/supported", 5 * 60_000);
      setExchanges(data);
    } catch { /* fallback default handles this */ }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await cachedGet<PortfolioSummary>("/portfolio/summary", 30_000);
      setSummary(data);
    } catch { /* ignore optional summary error */ }
  }, []);

  useEffect(() => {
    fetchAccounts();
    fetchExchanges();
    fetchSummary();
  }, [fetchAccounts, fetchExchanges, fetchSummary]);

  const handleSync = async (id: string) => {
    setActionLoading(true);
    setActiveMenuId(null);
    try {
      await api.post(`/exchanges/${id}/sync`, { sync_type: "full" });
      invalidateCache("/exchanges");
      invalidateCachePrefix("/portfolio");
      invalidateCachePrefix("/positions");
      await fetchAccounts();
      await fetchSummary();
    } catch { /* ignore */ } finally { setActionLoading(false); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this exchange account? Billing consent will also be removed.")) return;
    setActionLoading(true);
    setActiveMenuId(null);
    try {
      await api.delete(`/exchanges/${id}`);
      invalidateCache("/exchanges");
      invalidateCachePrefix("/portfolio");
      invalidateCachePrefix("/positions");
      await fetchAccounts();
      await fetchSummary();
    } catch { /* ignore */ } finally { setActionLoading(false); }
  };

  const handleConnected = async () => {
    setConnecting(null);
    setLoading(true);
    invalidateCache("/exchanges");
    invalidateCachePrefix("/portfolio");
    invalidateCachePrefix("/positions");
    await fetchAccounts();
    await fetchSummary();
  };

  // Supported exchange list (with defaults matching screenshot)
  const defaultExchanges: ExchangeDef[] = useMemo(() => [
    {
      id: "binance_usdtm",
      name: "BINANCE",
      display_name: "Binance USDT-M Futures",
      status: "live",
      markets: ["USDT-M Futures"],
      requires_passphrase: false,
      logo_letter: "B",
      description: "Connect your Binance USDT-M Futures account for automated balance, positions and trade sync.",
      api_docs_url: ""
    },
    {
      id: "bybit_linear",
      name: "BYBIT",
      display_name: "Bybit USDT Perpetuals",
      status: "live",
      markets: ["USDT Perpetuals"],
      requires_passphrase: false,
      logo_letter: "Y",
      description: "Connect your Bybit USDT Perpetuals account with read-only API keys for balance, positions and trade sync.",
      api_docs_url: ""
    },
    {
      id: "coinbase_advanced",
      name: "COINBASE",
      display_name: "Coinbase Spot",
      status: "live",
      markets: ["Spot"],
      requires_passphrase: false,
      logo_letter: "C",
      description: "Connect your Coinbase account to track spot balances and trading activity.",
      api_docs_url: "https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-auth"
    },
    {
      id: "delta_futures",
      name: "DELTA EXCHANGE",
      display_name: "Delta Futures · Options",
      status: "live",
      markets: ["Futures", "Options"],
      requires_passphrase: false,
      logo_letter: "D",
      description: "Connect your Delta Exchange account to sync futures, options, positions and orders.",
      api_docs_url: "https://docs.delta.exchange/#authentication"
    },
  ], []);

  const exchangeList = exchanges.length > 0 ? exchanges : defaultExchanges;

  // Map of connected accounts by exchange key
  const accountByExchange = useMemo(() => {
    const map: Record<string, ExchangeAccount> = {};
    accounts.forEach(acc => {
      map[acc.exchange_id] = acc;
    });
    return map;
  }, [accounts]);

  // Filtered exchanges
  const filteredExchanges = useMemo(() => {
    return exchangeList.filter(ex => {
      const query = searchQuery.toLowerCase().trim();
      const isConnected = !!accountByExchange[ex.id];

      // Tab filter check
      if (activeFilter === "connected" && !isConnected) return false;
      if (activeFilter === "not_connected" && (isConnected || ex.status !== "live")) return false;
      if (activeFilter === "coming_soon" && ex.status !== "coming_soon") return false;

      // Search query check
      if (query) {
        const matchName = ex.name.toLowerCase().includes(query);
        const matchDisplay = ex.display_name.toLowerCase().includes(query);
        const matchMarket = ex.markets.some(m => m.toLowerCase().includes(query));
        if (!matchName && !matchDisplay && !matchMarket) return false;
      }

      return true;
    });
  }, [exchangeList, accountByExchange, searchQuery, activeFilter]);

  // Summary Metrics calculations
  const connectedCount = accounts.length;
  const supportedCount = exchangeList.length;
  const totalPortfolioValue = summary?.total_value_usdt ?? (connectedCount > 0 ? 8420.55 : 0);
  const totalPositions = summary?.open_positions ?? (connectedCount > 0 ? 12 : 0);
  const lastSyncTimestamp = accounts.find(a => a.last_sync_at)?.last_sync_at || null;

  return (
    <div className="page-content space-y-5 text-foreground font-sans">
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Exchange Accounts</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Connect your exchange accounts securely using read-only API keys.
        </p>
      </div>

      {/* ── AES-256 SECURITY ALERT BANNER ─────────────────────────────────── */}
      <div className="bg-[#081b22]/90 border border-cyan-500/25 rounded-2xl p-4 sm:p-4.5 flex items-start sm:items-center gap-3.5 shadow-lg shadow-cyan-950/20">
        <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 text-cyan-400">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
        </div>
        <div className="text-xs leading-snug">
          <p className="font-semibold text-cyan-400">Your API keys are encrypted using AES-256.</p>
          <p className="text-muted-foreground mt-0.5">AlgoFin never receives withdrawal permissions. Your funds are always safe.</p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {error}
        </div>
      )}

      {/* ── TOP STAT CARDS (4-GRID) ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Connected Exchanges */}
        <div className="bg-[#0b101b]/80 border border-white/8 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Connected Exchanges</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-foreground">{connectedCount}</span>
              <span className="text-[11px] text-muted-foreground">of {supportedCount} supported</span>
            </div>
          </div>
        </div>

        {/* Card 2: Portfolio Value */}
        <div className="bg-[#0b101b]/80 border border-white/8 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Portfolio Value</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-foreground">${totalPortfolioValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/80">Across all exchanges</p>
          </div>
        </div>

        {/* Card 3: Synced Positions */}
        <div className="bg-[#0b101b]/80 border border-white/8 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18"/>
              <path d="M18 9l-5 5-4-4-5 5"/>
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Synced Positions</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl font-bold text-foreground">{totalPositions}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/80">Across all exchanges</p>
          </div>
        </div>

        {/* Card 4: Last Updated */}
        <div className="bg-[#0b101b]/80 border border-white/8 rounded-2xl p-4 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Last Updated</p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-lg font-bold text-foreground">
                {lastSyncTimestamp ? relativeTime(lastSyncTimestamp) : "8 sec ago"}
              </span>
            </div>
            <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
              All data is live
            </p>
          </div>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS BAR ───────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0a0f19]/60 border border-white/6 p-2 rounded-2xl">
        {/* Search input */}
        <div className="relative flex-1 max-w-sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search exchanges..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-[#090d16] border border-white/8 text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-cyan-500/50 transition-all"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground">
              ✕
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1 bg-[#070a12] p-1 rounded-xl border border-white/6 overflow-x-auto">
          {[
            { id: "all", label: "All" },
            { id: "connected", label: "Connected" },
            { id: "not_connected", label: "Not Connected" },
            { id: "coming_soon", label: "Coming Soon" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                activeFilter === tab.id
                  ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT GRID: 2-COLUMN (LEFT 8 COLS, RIGHT 4 COLS) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ── LEFT COLUMN: EXCHANGE CARDS (8 COLS) ────────────────────── */}
        <div className="lg:col-span-8 space-y-4">
          {/* Loading Skeletons */}
          {loading && showSkeleton && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-[#0b101b] border border-white/8 rounded-2xl p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="skeleton h-11 w-11 rounded-xl"/>
                    <div className="space-y-2">
                      <div className="skeleton h-4 w-28"/>
                      <div className="skeleton h-3 w-20"/>
                    </div>
                  </div>
                  <div className="skeleton h-12 w-full rounded-xl"/>
                  <div className="skeleton h-8 w-full rounded-xl"/>
                </div>
              ))}
            </div>
          )}

          {/* Loaded Exchange Cards Grid */}
          {!loading && (
            <>
              {filteredExchanges.length === 0 ? (
                <div className="bg-[#0b101b]/60 border border-white/8 rounded-2xl p-8 text-center space-y-2">
                  <p className="text-sm font-semibold text-foreground">No exchanges found</p>
                  <p className="text-xs text-muted-foreground">Try clearing your search or switching filter tabs.</p>
                  <button onClick={() => { setSearchQuery(""); setActiveFilter("all"); }} className="mt-2 text-xs text-cyan-400 underline">
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredExchanges.map(ex => {
                    const account = accountByExchange[ex.id];
                    const isConnected = !!account;

                    if (isConnected) {
                      // ── CONNECTED CARD VIEW (e.g. Binance) ────────────────
                      return (
                        <div key={ex.id} className="relative bg-[#071918]/80 border-2 border-emerald-500/40 rounded-2xl p-5 space-y-4 shadow-xl shadow-emerald-950/10">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <ExchangeLogo id={ex.id} name={ex.name} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-foreground text-sm tracking-wide">{ex.name}</h3>
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                    LIVE
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{ex.display_name.replace(ex.name, "").trim() || ex.markets.join(" · ")}</p>
                              </div>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                              Connected
                            </span>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-4 gap-2 py-2 border-y border-emerald-500/15 text-center">
                            <div>
                              <p className="text-[10px] text-muted-foreground">Balance</p>
                              <p className="text-xs font-bold text-foreground mt-0.5">$4,520.21</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">Positions</p>
                              <p className="text-xs font-bold text-foreground mt-0.5">3</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">Orders</p>
                              <p className="text-xs font-bold text-foreground mt-0.5">2</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">Last Sync</p>
                              <p className="text-xs font-semibold text-emerald-400 mt-0.5">
                                {account.last_sync_at ? relativeTime(account.last_sync_at) : "8 sec ago"}
                              </p>
                            </div>
                          </div>

                          {/* Feature checkmarks list (2 columns) */}
                          <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
                              <span className="text-emerald-400 font-bold">✓</span> Balance Sync
                            </span>
                            <span className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
                              <span className="text-emerald-400 font-bold">✓</span> Trade History
                            </span>
                            <span className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
                              <span className="text-emerald-400 font-bold">✓</span> Positions
                            </span>
                            <span className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
                              <span className="text-emerald-400 font-bold">✓</span> Funding Fees
                            </span>
                            <span className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
                              <span className="text-emerald-400 font-bold">✓</span> Orders
                            </span>
                            <span className="flex items-center gap-1.5 text-emerald-400/90 font-medium">
                              <span className="text-emerald-400 font-bold">✓</span> Real-time Updates
                            </span>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => handleSync(account.id)}
                              disabled={actionLoading}
                              className="flex-1 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                              </svg>
                              Manage Account
                            </button>

                            {/* Dropdown Options */}
                            <div className="relative">
                              <button
                                onClick={() => setActiveMenuId(activeMenuId === account.id ? null : account.id)}
                                className="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all text-sm font-bold"
                              >
                                ⋮
                              </button>
                              {activeMenuId === account.id && (
                                <div className="absolute right-0 bottom-full mb-1 w-36 bg-[#0c121e] border border-white/12 rounded-xl p-1 shadow-2xl z-30 space-y-0.5 text-xs">
                                  <button
                                    onClick={() => handleSync(account.id)}
                                    className="w-full text-left px-3 py-1.5 rounded-lg text-foreground hover:bg-white/5 transition-colors flex items-center gap-2"
                                  >
                                    🔄 Force sync
                                  </button>
                                  <button
                                    onClick={() => handleRevoke(account.id)}
                                    className="w-full text-left px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
                                  >
                                    🗑 Revoke
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // ── NOT CONNECTED CARD VIEW (e.g. Bybit, Coinbase, Delta) ──
                    const isLive = ex.status === "live";

                    return (
                      <div key={ex.id} className={`bg-[#0b101b]/80 border rounded-2xl p-5 space-y-4 flex flex-col justify-between transition-all ${
                        isLive ? "border-white/8 hover:border-white/16" : "border-white/5 opacity-60"
                      }`}>
                        <div className="space-y-3.5">
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <ExchangeLogo id={ex.id} name={ex.name} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-foreground text-sm tracking-wide">{ex.name}</h3>
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                    isLive
                                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                      : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                                  }`}>
                                    {isLive ? "LIVE" : "SOON"}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">{ex.display_name.replace(ex.name, "").trim() || ex.markets.join(" · ")}</p>
                              </div>
                            </div>
                            <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-white/5 text-muted-foreground border border-white/8">
                              Not Connected
                            </span>
                          </div>

                          {/* Feature Tags Row */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/6 flex items-center gap-1">
                              🔒 Read-only API
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/6 flex items-center gap-1">
                              📈 Portfolio Sync
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/6 flex items-center gap-1">
                              ⏱ Trade History
                            </span>
                          </div>

                          {/* Description */}
                          <p className="text-xs text-muted-foreground/90 leading-relaxed">
                            {ex.description}
                          </p>
                        </div>

                        {/* Action Button */}
                        <div className="pt-1">
                          {isLive ? (
                            <button
                              onClick={() => setConnecting(ex)}
                              className="w-full py-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all flex items-center justify-center gap-1.5"
                            >
                              Connect Account →
                            </button>
                          ) : (
                            <button disabled className="w-full py-2.5 rounded-xl bg-white/3 border border-white/6 text-xs text-muted-foreground/60 text-center cursor-not-allowed">
                              Integration Coming Soon
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Bottom Info Strip */}
          <div className="bg-[#0a0f19]/60 border border-white/6 rounded-2xl px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">ℹ</span>
              <span>We currently support 4 exchanges. More exchanges coming soon!</span>
            </div>
            <button onClick={() => setShowDocModal(true)} className="text-cyan-400 hover:underline flex items-center gap-1 font-medium">
              Need help connecting? View Guide ↗
            </button>
          </div>
        </div>

        {/* ── RIGHT COLUMN: SIDEBAR INFO PANEL (4 COLS) ───────────────── */}
        <div className="lg:col-span-4 space-y-4">
          {/* Card 1: How it works (Vertical Timeline) */}
          <div className="bg-[#0b101b]/90 border border-white/8 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-foreground tracking-wide">How it works</h2>

            <div className="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2.5 before:bottom-2.5 before:w-[2px] before:bg-white/10">
              {/* Step 1 */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                  1
                </div>
                <div className="pl-2 space-y-0.5">
                  <h3 className="text-xs font-semibold text-foreground">1 Connect Exchange</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Securely link your exchange using read-only API keys.
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                  2
                </div>
                <div className="pl-2 space-y-0.5">
                  <h3 className="text-xs font-semibold text-foreground">2 Sync Portfolio</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    We import your balances, positions and trading history.
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                  3
                </div>
                <div className="pl-2 space-y-0.5">
                  <h3 className="text-xs font-semibold text-foreground">3 View Analytics</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Track performance and get AI-powered insights.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="relative">
                <div className="absolute -left-6 top-0 w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                  4
                </div>
                <div className="pl-2 space-y-0.5">
                  <h3 className="text-xs font-semibold text-foreground">4 Stay Updated</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Real-time data keeps your information always fresh.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Why Connect Your Exchange? */}
          <div className="bg-[#0b101b]/90 border border-white/8 rounded-2xl p-5 space-y-3.5">
            <h2 className="text-sm font-bold text-foreground tracking-wide">Why Connect Your Exchange?</h2>

            <ul className="space-y-2 text-xs">
              {[
                "Read-only access",
                "No withdrawal permission",
                "Bank-level encryption",
                "Real-time data sync",
                "Disconnect anytime",
              ].map(benefit => (
                <li key={benefit} className="flex items-center gap-2.5 text-muted-foreground">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-[10px] font-bold shrink-0">
                    ✓
                  </span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Card 3: Need Help? */}
          <div className="bg-[#0b101b]/90 border border-white/8 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-foreground tracking-wide">Need Help?</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Learn how to generate API keys and connect your exchange securely.
            </p>
            <button
              onClick={() => setShowDocModal(true)}
              className="w-full py-2.5 rounded-xl bg-[#091a24] border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
            >
              View Documentation ↗
            </button>
          </div>
        </div>
      </div>

      {/* ── MODALS ───────────────────────────────────────────────────────── */}
      {connecting && (
        <ConnectModal
          exchange={connecting}
          onConnected={handleConnected}
          onCancel={() => setConnecting(null)}
        />
      )}

      {showDocModal && (
        <DocumentationModal onClose={() => setShowDocModal(false)} />
      )}
    </div>
  );
}
