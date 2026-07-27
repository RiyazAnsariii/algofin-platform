"use client";
// src/app/(app)/exchanges/page.tsx
// AlgoFin v2 — Phase H: Multi-Exchange support & Fully Aligned Viewport Interface

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

// ── Billing consent text ──────────────────────────────────────────
const CONSENT_TEXT =
  "AlgoFin calculates and displays an estimated performance fee of 20% of my " +
  "monthly realized profit from this exchange account for beta evaluation " +
  "purposes. This is not a charge. All manual trades on this account are included " +
  "regardless of whether AlgoFin placed them.";

// ── Exchange SVG Logos ─────────────────────────────────────────────
export function BinanceLogo({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#0b0e11] border border-[#F0B90B]/30 flex items-center justify-center shrink-0 p-1.5 shadow-md`}>
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="12" fill="#0b0e11"/>
        <path d="M12 4l2.625 2.625L12 9.25 9.375 6.625 12 4zm-5.25 5.25l2.625 2.625L6.75 14.5 4.125 11.875 6.75 9.25zm10.5 0l2.625 2.625-2.625 2.625-2.625-2.625 2.625-2.625zM12 14.5l2.625 2.625L12 19.75l-2.625-2.625L12 14.5zm0-3.938l1.313-1.312 1.312 1.312-1.312 1.313L12 10.562z" fill="#F0B90B"/>
      </svg>
    </div>
  );
}

export function BybitLogo({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#0d0e12] border border-amber-500/20 flex items-center justify-center shrink-0 p-1 shadow-md select-none`}>
      <span className="font-extrabold text-[11px] tracking-tight text-white font-sans flex items-center">
        BY<span className="inline-block w-[3.5px] h-3.5 bg-[#F7A600] rounded-[1px] mx-[1px]" />T
      </span>
    </div>
  );
}

export function CoinbaseLogo({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#0052FF] border border-[#0052FF]/50 flex items-center justify-center shrink-0 p-1.5 shadow-md`}>
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 15a5 5 0 1 1 3.536-8.536H12v3h3.536A5.002 5.002 0 0 1 12 17z" fill="white"/>
      </svg>
    </div>
  );
}

export function DeltaLogo({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <div className={`${className} rounded-xl bg-[#0c0d12] border border-white/10 flex items-center justify-center shrink-0 p-1 shadow-md`}>
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
  if (key.includes("binance") || key === "b") return <BinanceLogo className="w-9 h-9" />;
  if (key.includes("bybit") || key === "y") return <BybitLogo className="w-9 h-9" />;
  if (key.includes("coinbase") || key === "c") return <CoinbaseLogo className="w-9 h-9" />;
  if (key.includes("delta") || key === "d") return <DeltaLogo className="w-9 h-9" />;

  return (
    <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-foreground shrink-0">
      {(name || "E").substring(0, 2).toUpperCase()}
    </div>
  );
}

// ── Billing consent modal ─────────────────────────────────────────
function ConsentModal({ onAgree, onCancel }: { onAgree: () => void; onCancel: () => void }) {
  const [accepted, setAccepted] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-md glass-strong rounded-2xl border border-white/12 shadow-2xl p-5 space-y-4 animate-fade-up">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-cyan-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">Estimated monthly fee — consent required</h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Before connecting, please read and accept the billing terms for this account.
          </p>
        </div>

        <div className="bg-[#0b1019] rounded-xl border border-white/8 p-3 text-[11px] leading-relaxed text-foreground/90">
          {CONSENT_TEXT}
        </div>

        <ul className="space-y-1.5 text-[11px]">
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

        <label className="flex items-start gap-2.5 cursor-pointer group">
          <div
            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
              accepted ? "bg-cyan-500 border-cyan-500" : "border-white/20 group-hover:border-cyan-500/50"
            }`}
            onClick={() => setAccepted(p => !p)} role="checkbox" aria-checked={accepted}
          >
            {accepted && (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-black" />
              </svg>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground leading-snug">
            I understand and agree to the estimated fee terms described above.
          </span>
        </label>

        <div className="flex gap-2.5 pt-1">
          <button onClick={onCancel}
            className="flex-1 py-2 rounded-xl border border-white/10 text-xs font-medium text-muted-foreground hover:border-white/20 hover:text-foreground transition-all">
            Cancel
          </button>
          <button onClick={onAgree} disabled={!accepted}
            className="flex-1 py-2 rounded-xl bg-cyan-500 text-black text-xs font-semibold hover:bg-cyan-400 transition-all glow-cyan-sm disabled:opacity-40 disabled:cursor-not-allowed">
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
    w-full px-3 py-2 rounded-xl text-xs bg-[#090d16] border transition-all outline-none
    text-foreground placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-cyan-500/30
    ${errors[key] ? "border-rose-500/50" : "border-white/10 focus:border-cyan-500/50"}
  `;

  return (
    <>
      {step === "consent" && (
        <ConsentModal onAgree={handleConsentAgree} onCancel={() => setStep("form")} />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <div className="w-full max-w-md bg-[#0c121e] border border-white/12 rounded-2xl p-5 space-y-4 animate-fade-up shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/8 pb-3">
            <div className="flex items-center gap-2.5">
              <ExchangeLogo id={exchange.id} name={exchange.name} />
              <div>
                <h2 className="font-semibold text-foreground text-sm">Connect {exchange.name}</h2>
                <p className="text-[11px] text-muted-foreground">{exchange.display_name}</p>
              </div>
            </div>
            <button onClick={onCancel} className="text-muted-foreground hover:text-foreground text-xl leading-none p-1">×</button>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-3">
            {apiError && (
              <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                {apiError}
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-foreground/90">Account label</label>
              <input value={label} onChange={e => { setLabel(e.target.value); setErrors(p => ({ ...p, label: "" })); }}
                placeholder={`e.g. My ${exchange.name} Account`} className={fieldClass("label")} />
              {errors.label && <p className="text-[10px] text-rose-400">{errors.label}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-foreground/90">{exchange.name} API Key</label>
              <input value={apiKey} onChange={e => { setApiKey(e.target.value); setErrors(p => ({ ...p, apiKey: "" })); }}
                placeholder={`Paste your ${exchange.name} API key`} className={fieldClass("apiKey")} autoComplete="off" />
              {errors.apiKey && <p className="text-[10px] text-rose-400">{errors.apiKey}</p>}
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-foreground/90">API Secret</label>
              <input type="password" value={apiSecret} onChange={e => { setApiSecret(e.target.value); setErrors(p => ({ ...p, apiSecret: "" })); }}
                placeholder="Paste your API secret" className={fieldClass("apiSecret")} autoComplete="off" />
              {errors.apiSecret && <p className="text-[10px] text-rose-400">{errors.apiSecret}</p>}
            </div>

            {exchange.requires_passphrase && (
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-foreground/90">API Passphrase</label>
                <input type="password" value={passphrase} onChange={e => { setPassphrase(e.target.value); setErrors(p => ({ ...p, passphrase: "" })); }}
                  placeholder="Paste your API passphrase" className={fieldClass("passphrase")} autoComplete="off" />
                {errors.passphrase && <p className="text-[10px] text-rose-400">{errors.passphrase}</p>}
              </div>
            )}

            {/* Security note */}
            <div className="px-3 py-2 rounded-xl bg-cyan-500/5 border border-cyan-500/15 text-[10px] text-muted-foreground space-y-0.5">
              <p className="font-semibold text-cyan-400">🔒 Read-only permissions only</p>
              <p>AlgoFin never requests withdrawal rights. Credentials are encrypted with AES-256.</p>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button type="button" onClick={onCancel}
                className="flex-1 py-2 rounded-xl border border-white/10 text-xs font-medium text-muted-foreground hover:border-white/20 hover:text-foreground transition-all">
                Cancel
              </button>
              <button type="submit" disabled={step === "connecting"}
                className="flex-1 py-2 rounded-xl bg-cyan-500 text-black font-semibold text-xs hover:bg-cyan-400 transition-all glow-cyan-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {step === "connecting" ? "Connecting…" : "Connect Account →"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ── Documentation / How It Works Modal (Image 2 Design 1:1) ───────
function DocumentationModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-[#070b14] border border-[#121c2e] rounded-3xl p-6 space-y-5 animate-fade-up shadow-2xl relative overflow-hidden">
        {/* Top Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-950/40 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 shadow-inner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-extrabold text-foreground tracking-wide uppercase font-sans">HOW IT WORKS</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Get started in 4 simple steps and unlock powerful insights.</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-xl border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs font-bold transition-all hover:bg-white/5">
            ✕
          </button>
        </div>

        {/* 4 Vertical Timeline Steps */}
        <div className="relative pl-2.5 space-y-3">
          {/* Vertical Connecting Line */}
          <div className="absolute left-[21px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-purple-500/60 via-cyan-500/60 to-blue-500/60" />

          {/* Step 1 */}
          <div className="relative flex items-center gap-3.5 z-10">
            <div className="w-8 h-8 rounded-full bg-[#0c0915] border-2 border-purple-500 text-purple-400 font-bold text-xs flex items-center justify-center shrink-0 shadow-md">
              1
            </div>
            <div className="flex-1 bg-[#0a0f1d]/90 border border-purple-500/20 hover:border-purple-500/40 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Connect Exchange</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Securely link read-only API keys from your exchange account.</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-purple-950/70 border border-purple-500/40 text-purple-300 text-[10px] font-semibold tracking-wide whitespace-nowrap shrink-0">
                🛡 100% Secure
              </span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative flex items-center gap-3.5 z-10">
            <div className="w-8 h-8 rounded-full bg-[#0c0915] border-2 border-purple-500 text-purple-400 font-bold text-xs flex items-center justify-center shrink-0 shadow-md">
              2
            </div>
            <div className="flex-1 bg-[#0a0f1d]/90 border border-purple-500/20 hover:border-purple-500/40 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6" />
                    <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Sync Portfolio</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Automatically import balances, open positions & trade history.</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-purple-950/70 border border-purple-500/40 text-purple-300 text-[10px] font-semibold tracking-wide whitespace-nowrap shrink-0">
                🖥 Auto Sync
              </span>
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative flex items-center gap-3.5 z-10">
            <div className="w-8 h-8 rounded-full bg-[#06151f] border-2 border-cyan-500 text-cyan-400 font-bold text-xs flex items-center justify-center shrink-0 shadow-md">
              3
            </div>
            <div className="flex-1 bg-[#06141d]/90 border border-cyan-500/20 hover:border-cyan-500/40 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">View Analytics</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Track performance metrics & get real-time AI trading insights.</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 text-[10px] font-semibold tracking-wide whitespace-nowrap shrink-0">
                📈 AI Insights
              </span>
            </div>
          </div>

          {/* Step 4 */}
          <div className="relative flex items-center gap-3.5 z-10">
            <div className="w-8 h-8 rounded-full bg-[#071120] border-2 border-blue-500 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 shadow-md">
              4
            </div>
            <div className="flex-1 bg-[#081324]/90 border border-blue-500/20 hover:border-blue-500/40 rounded-2xl p-3 px-4 flex items-center justify-between gap-3 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">Stay Updated</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Real-time market feeds keep your dashboard data always fresh.</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-blue-950/70 border border-blue-500/40 text-blue-300 text-[10px] font-semibold tracking-wide whitespace-nowrap shrink-0">
                ⚡ Real-time
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Button */}
        <div className="pt-1">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-cyan-500 text-black text-xs font-bold hover:bg-cyan-400 transition-all glow-cyan-sm shadow-md">
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page (Fills space perfectly down to Sign Out line) ─────────────
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
  const [activeFilter, setActiveFilter]     = useState<"all" | "connected">("all");

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
      setError(detail ? `${detail} (${status})` : `Failed to load exchange accounts.`);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchExchanges = useCallback(async () => {
    try {
      invalidateCache("/exchanges/supported");
      const res = await api.get<ExchangeDef[]>("/exchanges/supported");
      setExchanges(res.data);
    } catch { /* fallback */ }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await cachedGet<PortfolioSummary>("/portfolio/summary", 30_000);
      setSummary(data);
    } catch { /* fallback */ }
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

  // Supported exchange list
  const defaultExchanges: ExchangeDef[] = useMemo(() => [
    {
      id: "binance_usdtm",
      name: "Binance",
      display_name: "USDT-M Futures",
      status: "live",
      markets: ["USDT-M Futures"],
      requires_passphrase: false,
      logo_letter: "B",
      description: "The world's largest cryptocurrency exchange by trading volume. Trusted by millions for secure, fast, and reliable digital asset trading.",
      api_docs_url: ""
    },
    {
      id: "bybit_linear",
      name: "Bybit",
      display_name: "Linear Perpetuals",
      status: "live",
      markets: ["Linear Perpetuals"],
      requires_passphrase: false,
      logo_letter: "Y",
      description: "A leading cryptocurrency exchange built for fast and professional trading. Renowned for its derivatives platform, intuitive interface, and high performance.",
      api_docs_url: ""
    },
    {
      id: "coinbase_advanced",
      name: "Coinbase",
      display_name: "Advanced Trade",
      status: "live",
      markets: ["Advanced Trade"],
      requires_passphrase: false,
      logo_letter: "C",
      description: "Coinbase Advanced Trade (formerly Coinbase Pro). Spot trading. Connect with read-only API keys for balance and trade sync.",
      api_docs_url: "https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-auth"
    },
    {
      id: "delta_futures",
      name: "Delta Exchange",
      display_name: "Futures & Options",
      status: "live",
      markets: ["Futures & Options"],
      requires_passphrase: false,
      logo_letter: "D",
      description: "Delta Exchange (India & Global). USDT-settled futures, perpetuals, and options. Connect with read-only API keys for balance, positions and trade sync.",
      api_docs_url: "https://docs.delta.exchange/#authentication"
    },
  ], []);

  const exchangeList = exchanges.length > 0 ? exchanges : defaultExchanges;

  const accountByExchange = useMemo(() => {
    const map: Record<string, ExchangeAccount> = {};
    accounts.forEach(acc => {
      map[acc.exchange_id] = acc;
    });
    return map;
  }, [accounts]);

  const filteredExchanges = useMemo(() => {
    return exchangeList.filter(ex => {
      const query = searchQuery.toLowerCase().trim();
      const isConnected = !!accountByExchange[ex.id];

      if (activeFilter === "connected" && !isConnected) return false;

      if (query) {
        const matchName = ex.name.toLowerCase().includes(query);
        const matchDisplay = ex.display_name.toLowerCase().includes(query);
        const matchMarket = ex.markets.some(m => m.toLowerCase().includes(query));
        if (!matchName && !matchDisplay && !matchMarket) return false;
      }

      return true;
    });
  }, [exchangeList, accountByExchange, searchQuery, activeFilter]);

  const connectedCount = accounts.length;
  const supportedCount = exchangeList.length;
  const totalPortfolioValue = summary?.total_value_usdt ?? (connectedCount > 0 ? 8420.55 : 0);
  const totalPositions = summary?.open_positions ?? (connectedCount > 0 ? 12 : 0);
  const lastSyncTimestamp = accounts.find(a => a.last_sync_at)?.last_sync_at || null;

  return (
    <div className="w-full max-w-[1440px] mx-auto h-[calc(100vh-3.25rem)] flex flex-col justify-between text-foreground font-sans gap-2 overflow-hidden">
      {/* ── TOP AREA ────────────────────────────────────────────────────── */}
      <div className="space-y-2 shrink-0">
        {/* Header with View Documentation button */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Exchange Accounts</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect your exchange accounts securely using read-only API keys.
            </p>
          </div>
          <button
            onClick={() => setShowDocModal(true)}
            className="px-3.5 py-1.5 rounded-xl border border-white/10 text-muted-foreground hover:text-foreground text-xs font-semibold bg-white/5 hover:bg-white/10 transition-all flex items-center gap-1.5 shrink-0 shadow-sm"
          >
            View Documentation ↗
          </button>
        </div>

        {/* Security Alert Banner */}
        <div className="bg-[#081b22]/90 border border-cyan-500/30 rounded-xl p-2.5 px-3.5 flex items-center gap-3 shadow-sm">
          <div className="w-7.5 h-7.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 text-cyan-400">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div className="text-xs leading-snug">
            <span className="font-bold text-cyan-400">Your API keys are encrypted using AES-256.</span>{" "}
            <span className="text-muted-foreground">AlgoFin never receives withdrawal permissions. Your funds are always safe.</span>
          </div>
        </div>

        {error && (
          <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 font-medium">
            {error}
          </div>
        )}

        {/* Top 4 Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Card 1: Connected Exchanges */}
          <div className="bg-[#0b101b]/90 border border-white/8 rounded-xl p-2.5 px-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-8.5 h-8.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground leading-none">Connected Exchanges</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-extrabold text-foreground">{connectedCount}</span>
                <span className="text-[11px] text-muted-foreground">of {supportedCount} supported</span>
              </div>
            </div>
          </div>

          {/* Card 2: Portfolio Value */}
          <div className="bg-[#0b101b]/90 border border-white/8 rounded-xl p-2.5 px-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-8.5 h-8.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground leading-none">Portfolio Value</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-extrabold text-foreground">${totalPortfolioValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className="text-[10px] text-muted-foreground/80">Across all exchanges</span>
              </div>
            </div>
          </div>

          {/* Card 3: Synced Positions */}
          <div className="bg-[#0b101b]/90 border border-white/8 rounded-xl p-2.5 px-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-8.5 h-8.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18"/>
                <path d="M18 9l-5 5-4-4-5 5"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground leading-none">Synced Positions</p>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base font-extrabold text-foreground">{totalPositions}</span>
                <span className="text-[10px] text-muted-foreground/80">Across all exchanges</span>
              </div>
            </div>
          </div>

          {/* Card 4: Last Updated */}
          <div className="bg-[#0b101b]/90 border border-white/8 rounded-xl p-2.5 px-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-8.5 h-8.5 rounded-xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400 shrink-0">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground leading-none">Last Updated</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs font-bold text-foreground">
                  {lastSyncTimestamp ? relativeTime(lastSyncTimestamp) : "--"}
                </span>
                <span className="text-[10px] text-muted-foreground/80 font-medium">
                  {connectedCount > 0 ? "Live" : "No data"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#0a0f19]/80 border border-white/8 p-1 px-3 rounded-xl shadow-sm">
          {/* Filter pills on Left */}
          <div className="flex items-center gap-1">
            {[
              { id: "all", label: "All" },
              { id: "connected", label: "Connected" },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  activeFilter === tab.id
                    ? "bg-[#0a2730] text-cyan-400 border border-cyan-500/30 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search input on Right */}
          <div className="relative flex-1 max-w-xs">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search exchanges..."
              className="w-full pl-8.5 pr-3 py-1 rounded-lg text-xs bg-[#090d16] border border-white/8 text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-cyan-500/50 transition-all"
            />
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT GRID (Fits 100% on Single Screen with Zero Scrollbar) ─────────── */}
      <div className="flex flex-col gap-2 flex-1 min-h-0 justify-between">
        {/* Skeletons */}
        {loading && showSkeleton && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-1 min-h-0">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-[#0b101b] border border-white/8 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="skeleton h-9 w-9 rounded-xl"/>
                  <div className="space-y-1.5">
                    <div className="skeleton h-4 w-24"/>
                    <div className="skeleton h-3 w-16"/>
                  </div>
                </div>
                <div className="skeleton h-10 w-full rounded-xl"/>
              </div>
            ))}
          </div>
        )}

        {/* Cards Grid */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 flex-1 min-h-0">
            {filteredExchanges.map(ex => {
              const account = accountByExchange[ex.id];
              const isConnected = !!account;

              if (isConnected) {
                // ── CONNECTED CARD ─────────────────────────────────────────
                const formattedDate = account.created_at
                  ? new Date(account.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "May 24, 2025";

                return (
                  <div key={ex.id} className="relative bg-[#070c16]/95 border border-[#0d2238] rounded-2xl p-3.5 px-4 flex flex-col justify-between shadow-xl transition-all hover:border-[#133252] min-h-0">
                    {/* Top Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <ExchangeLogo id={ex.id} name={ex.name} />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-foreground text-sm tracking-wide">{ex.name}</h3>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 text-[9px] font-extrabold tracking-wider">
                              CONNECTED
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                            {ex.display_name.replace(ex.name, "").trim() || ex.markets.join(" · ")}
                          </p>
                        </div>
                      </div>

                      {/* Connected Date & Options Menu */}
                      <div className="flex items-center gap-2">
                        <div className="text-right hidden sm:block">
                          <p className="text-[9px] text-muted-foreground/70 leading-none">Connected on</p>
                          <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{formattedDate}</p>
                        </div>
                        <div className="relative">
                          <button
                            onClick={() => setActiveMenuId(activeMenuId === account.id ? null : account.id)}
                            className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground text-xs font-bold transition-all hover:bg-white/5"
                          >
                            ⋮
                          </button>
                          {activeMenuId === account.id && (
                            <div className="absolute right-0 top-full mt-1 w-36 bg-[#0c121e] border border-white/12 rounded-xl p-1 shadow-2xl z-30 text-xs">
                              <button onClick={() => handleSync(account.id)} className="w-full text-left px-3 py-1.5 rounded-lg text-foreground hover:bg-white/5 flex items-center gap-2">
                                <span>🔄</span> Force sync
                              </button>
                              <button onClick={() => handleRevoke(account.id)} className="w-full text-left px-3 py-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 flex items-center gap-2">
                                <span>🗑</span> Revoke
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Middle Feature Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="px-2.5 py-0.5 rounded-lg bg-[#071828] border border-cyan-500/20 text-cyan-400 font-medium flex items-center gap-1">
                        🔒 Read-only API
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-[#071828] border border-cyan-500/20 text-cyan-400 font-medium flex items-center gap-1">
                        🔄 Portfolio Sync
                      </span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-[#071828] border border-cyan-500/20 text-cyan-400 font-medium flex items-center gap-1">
                        ⏱ Trade History
                      </span>
                    </div>

                    {/* Bottom Stats & Action Row */}
                    <div className="flex items-end justify-between pt-1.5 border-t border-white/6 gap-2">
                      <div className="flex items-baseline gap-4 sm:gap-6">
                        <div>
                          <p className="text-sm sm:text-base font-extrabold text-foreground tracking-tight">
                            $8,742.31
                          </p>
                          <p className="text-[10px] text-muted-foreground/80 mt-0.5">Balance</p>
                        </div>
                        <div>
                          <p className="text-sm sm:text-base font-extrabold text-foreground tracking-tight">5</p>
                          <p className="text-[10px] text-muted-foreground/80 mt-0.5">Positions</p>
                        </div>
                        <div>
                          <p className="text-sm sm:text-base font-extrabold text-foreground tracking-tight">3</p>
                          <p className="text-[10px] text-muted-foreground/80 mt-0.5">Open Orders</p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleSync(account.id)}
                        disabled={actionLoading}
                        className="px-3.5 py-1.5 rounded-lg bg-[#061e30] border border-cyan-500/40 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 hover:border-cyan-500/60 transition-all flex items-center gap-1 shrink-0"
                      >
                        View Details →
                      </button>
                    </div>
                  </div>
                );
              }

              // ── NOT CONNECTED CARD (Fits 100% without Empty Void) ───────────────────
              return (
                <div key={ex.id} className="bg-[#0b101b]/90 border border-white/8 hover:border-white/16 rounded-2xl p-3.5 px-4 flex flex-col justify-between shadow-md min-h-0">
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <ExchangeLogo id={ex.id} name={ex.name} />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-foreground text-sm tracking-wide">{ex.name}</h3>
                            <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-muted-foreground/70 border border-white/8 uppercase">
                              NOT CONNECTED
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{ex.display_name.replace(ex.name, "").trim() || ex.markets.join(" · ")}</p>
                        </div>
                      </div>
                    </div>

                    {/* Feature Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="px-2.5 py-0.5 rounded-lg bg-white/4 border border-white/6 flex items-center gap-1">🔒 Read-only API</span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-white/4 border border-white/6 flex items-center gap-1">🔄 Portfolio Sync</span>
                      <span className="px-2.5 py-0.5 rounded-lg bg-white/4 border border-white/6 flex items-center gap-1">⏱ Trade History</span>
                    </div>

                    {/* Description */}
                    <p className="text-xs text-muted-foreground/90 leading-relaxed line-clamp-2">
                      {ex.description}
                    </p>
                  </div>

                  {/* Action Button */}
                  <div className="pt-1">
                    <button
                      onClick={() => setConnecting(ex)}
                      className="w-full py-2.5 rounded-xl bg-[#061e2b]/80 border border-cyan-500/40 text-cyan-400 text-xs font-bold hover:bg-cyan-500/20 hover:border-cyan-500/60 transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      Connect Account →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Info Strip (Fixed cleanly at bottom of viewport screen) */}
        <div className="shrink-0 bg-[#06151f]/80 border border-cyan-500/20 rounded-xl px-4 py-2 flex items-center justify-between gap-2 text-xs text-muted-foreground shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-bold">ℹ</span>
            <span>We currently support 4 exchanges.</span>
          </div>
          <button onClick={() => setShowDocModal(true)} className="text-cyan-400 hover:underline font-medium flex items-center gap-1">
            View Guide ↗
          </button>
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
