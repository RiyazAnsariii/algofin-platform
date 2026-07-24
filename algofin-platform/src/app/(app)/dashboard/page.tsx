"use client";
// src/app/(app)/dashboard/page.tsx
// AlgoFin v2 — Dashboard: portfolio summary + positions + live prices

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { cachedGet, invalidateCachePrefix } from "@/lib/apiCache";
import { relativeTime } from "@/lib/staleness";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// ── API response types ────────────────────────────────────────────
interface FreshnessItem {
  synced_at: string | null;
  is_stale:  boolean;
}

interface PortfolioSummary {
  total_value_usdt:   number;
  open_positions:     number;
  realized_pnl_mtd:   number;
  connected_accounts: number;
  data_freshness: {
    balances:  FreshnessItem;
    positions: FreshnessItem;
    trades:    FreshnessItem;
  };
}

interface Position {
  id:                  string;
  exchange_account_id: string;
  symbol:              string;
  side:                "long" | "short";
  size:                number;
  entry_price:         number;
  mark_price:          number;
  unrealized_pnl:      number;
  leverage:            number;
  margin_type:         string;
  last_updated_at:     string;
}

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

const fmtPnl = (n: number) => {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${fmt(Math.abs(n))}`;
};

// ── Live status badge ─────────────────────────────────────────────
function LiveBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold
        bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        LIVE
      </span>
    );
  }
  if (status === "reconnecting" || status === "auth" || status === "connecting") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold
        bg-amber-500/15 text-amber-400 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        RECONNECTING
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold
      bg-rose-500/10 text-rose-400 border border-rose-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
      OFFLINE
    </span>
  );
}

// ── Staleness badge ───────────────────────────────────────────────
function FreshnessBadge({ item, label }: { item: FreshnessItem; label: string }) {
  if (item.is_stale || !item.synced_at) {
    return (
      <span className="badge-stale text-[10px]">
        <span className="pulse-dot-amber w-1.5 h-1.5" />
        {label} stale
      </span>
    );
  }
  return (
    <span className="badge-connected text-[10px]">
      <span className="pulse-dot w-1.5 h-1.5" />
      {label} live
    </span>
  );
}

// ── Stat card ─────────────────────────────────────────────────────
function StatCard({
  icon,
  label,
  value,
  sub,
  valueClass = "text-foreground",
  loading,
}: {
  icon:       React.ReactNode;
  label:      string;
  value:      React.ReactNode;
  sub?:       string;
  valueClass?: string;
  loading:    boolean;
}) {
  return (
    <div className="surface-card p-4 space-y-2">
      <div className="flex items-center gap-2.5">
        {icon}
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-7 w-28" />
          {sub && <div className="skeleton h-3 w-20" />}
        </div>
      ) : (
        <>
          <p className={`text-2xl font-bold tracking-tight ${valueClass}`}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </>
      )}
    </div>
  );
}

// ── Position row (with live price + Est. Live PnL) ────────────────
function PositionRow({
  pos,
  livePnl,
  liveMarkPrice,
}: {
  pos: Position;
  livePnl: number | null;
  liveMarkPrice: number | null;
}) {
  const displayPnl  = livePnl ?? pos.unrealized_pnl;
  const displayMark = liveMarkPrice ?? pos.mark_price;
  const isLive      = livePnl !== null;
  const pnlColor    = displayPnl >= 0 ? "pnl-positive" : "pnl-negative";

  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm border-b border-white/4 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase
            ${pos.side === "long"
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-rose-500/15 text-rose-400"
            }`}
        >
          {pos.side}
        </span>
        <span className="font-medium text-foreground">{pos.symbol}</span>
        <span className="text-muted-foreground text-xs hidden sm:inline">
          {pos.size} × {pos.leverage}x
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <span className="text-xs text-muted-foreground hidden md:inline">
          Entry ${fmt(pos.entry_price)}
        </span>
        <span className="text-xs text-muted-foreground hidden lg:inline">
          Mark ${fmt(displayMark)}
        </span>
        <div className="text-right">
          <span className={`font-semibold ${pnlColor}`}>
            {fmtPnl(displayPnl)}
          </span>
          {isLive && (
            <p className="text-[9px] text-muted-foreground/60 leading-none mt-0.5">
              Est. Live PnL
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Stale data banner ─────────────────────────────────────────────
function StaleBanner({ freshness }: { freshness: PortfolioSummary["data_freshness"] }) {
  const staleItems = Object.entries(freshness)
    .filter(([, v]) => v.is_stale)
    .map(([k]) => k);

  if (staleItems.length === 0) return null;

  return (
    <div className="px-4 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs flex items-start gap-2">
      <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
      <span className="text-amber-300">
        <strong>Data may be outdated</strong> — {staleItems.join(", ")} data is stale.
        {" "}Syncing in the background.
      </span>
    </div>
  );
}

// ── No exchange section (balanced full-screen fit down to sign out line) ─────────────
function NoExchangeSection() {
  return (
    <div className="flex-1 flex flex-col justify-between space-y-4 animate-fade-in pt-1">
      {/* Hero Card */}
      <div className="relative surface-card flex-1 min-h-[170px] py-6 px-6 text-center flex flex-col justify-center items-center overflow-hidden border border-white/8 rounded-2xl bg-gradient-to-b from-cyan-500/[0.02] via-transparent to-transparent">
        {/* Concentric rings pattern background */}
        <div className="absolute inset-0 pointer-events-none opacity-25 flex items-center justify-center">
          <div className="w-[300px] h-[300px] rounded-full border border-cyan-500/20 flex items-center justify-center">
            <div className="w-[210px] h-[210px] rounded-full border border-cyan-500/15 flex items-center justify-center">
              <div className="w-[130px] h-[130px] rounded-full border border-cyan-500/10" />
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-3 max-w-md mx-auto">
          <div className="w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400 shadow-glow-cyan-sm">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <path d="M8 21h8M12 17v4" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight">Connect your account</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Connect your exchange account to unlock your dashboard and start tracking.
            </p>
          </div>

          <div className="pt-1">
            <Link
              href="/exchanges"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black
                text-xs font-semibold transition-all shadow-glow-cyan transform hover:-translate-y-0.5"
            >
              Connect account →
            </Link>
          </div>
        </div>
      </div>

      {/* What you'll unlock */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">What you'll unlock</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Portfolio Tracking */}
          <div className="surface-card p-3.5 rounded-xl border border-white/6 flex flex-col justify-between space-y-2.5 hover:border-white/12 transition-all">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-xs text-foreground">Portfolio Tracking</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Real-time balance, equity and PnL overview
              </p>
            </div>
          </div>

          {/* Positions & Orders */}
          <div className="surface-card p-3.5 rounded-xl border border-white/6 flex flex-col justify-between space-y-2.5 hover:border-white/12 transition-all">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-xs text-foreground">Positions & Orders</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Live positions, open orders and order history
              </p>
            </div>
          </div>

          {/* Risk Management */}
          <div className="surface-card p-3.5 rounded-xl border border-white/6 flex flex-col justify-between space-y-2.5 hover:border-white/12 transition-all">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M12 2L3 7v6c0 4.97 3.84 9.63 9 11 5.16-1.37 9-6.03 9-11V7L12 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-xs text-foreground">Risk Management</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Monitor leverage, margin, and risk in real-time
              </p>
            </div>
          </div>

          {/* Performance Analytics */}
          <div className="surface-card p-3.5 rounded-xl border border-white/6 flex flex-col justify-between space-y-2.5 hover:border-white/12 transition-all">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M21.21 15.89A10 10 0 118 2.83" />
                <path d="M22 12A10 10 0 0012 2v10z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-xs text-foreground">Performance Analytics</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Detailed performance and trading insights
              </p>
            </div>
          </div>

          {/* Trade Journal */}
          <div className="surface-card p-3.5 rounded-xl border border-white/6 flex flex-col justify-between space-y-2.5 hover:border-white/12 transition-all">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-xs text-foreground">Trade Journal</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Auto-sync trades and review your history
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Security Banner */}
      <div className="surface-card p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 2L3 7v6c0 4.97 3.84 9.63 9 11 5.16-1.37 9-6.03 9-11V7L12 2z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-xs text-cyan-400">Your security is our priority</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              We never place trades or withdraw funds. Read-only access ensures your funds are always safe.
            </p>
          </div>
        </div>
        <Link
          href="/risk"
          className="shrink-0 px-4 py-1.5 rounded-lg border border-cyan-500/30 text-xs text-cyan-400 font-medium hover:bg-cyan-500/10 transition-all"
        >
          Learn more
        </Link>
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────
export default function DashboardPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton          = useDelayedLoading(loading);
  const [noExchange, setNoExchange] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Live prices (Phase A) ─────────────────────────────────────────
  const positionSymbols = positions.map((p) => p.symbol);
  const { prices, status: wsStatus, subscribe, calcEstLivePnl } = useLivePrices(positionSymbols);

  useEffect(() => {
    if (positionSymbols.length > 0) {
      subscribe(positionSymbols);
    }
  }, [positionSymbols.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async (bypassCache = false) => {
    if (bypassCache) invalidateCachePrefix("/portfolio");
    try {
      const [summaryRes, posRes] = await Promise.allSettled([
        bypassCache
          ? api.get<{ data: PortfolioSummary }>("/portfolio/summary").then(r => r.data.data)
          : cachedGet<PortfolioSummary>("/portfolio/summary", 45_000),
        bypassCache
          ? api.get<{ data: Position[] }>("/positions").then(r => r.data.data)
          : cachedGet<Position[]>("/positions", 45_000),
      ]);

      if (summaryRes.status === "fulfilled" && summaryRes.value) {
        const s = summaryRes.value;
        if (s.connected_accounts === 0) {
          setNoExchange(true);
        } else {
          setSummary(s);
          setNoExchange(false);
        }
      }
      if (posRes.status === "fulfilled" && Array.isArray(posRes.value)) {
        setPositions(posRes.value);
      }
      setLastUpdated(new Date());
    } catch {
      /* handled per-request */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const pnlMtd = summary?.realized_pnl_mtd ?? 0;
  const pnlPositive = pnlMtd >= 0;
  const estFee = pnlMtd > 0 ? pnlMtd * 0.2 : 0;

  return (
    <div className="min-h-[calc(100vh-3rem)] flex flex-col justify-between space-y-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>Binance USDT-M Futures overview</span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Updated just now
            </span>
            {!noExchange && <LiveBadge status={wsStatus} />}
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-white/6"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Loading state */}
      {loading && showSkeleton && (
        <div className="flex-1 flex flex-col justify-between space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="surface-card p-4 space-y-2">
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-7 w-28" />
                <div className="skeleton h-3 w-16" />
              </div>
            ))}
          </div>
          <div className="surface-card overflow-hidden flex-1 p-8 text-center flex flex-col justify-center items-center space-y-4">
            <div className="skeleton h-12 w-12 rounded-full mx-auto" />
            <div className="skeleton h-5 w-48 mx-auto" />
            <div className="skeleton h-4 w-64 mx-auto" />
          </div>
        </div>
      )}

      {/* Loaded state */}
      {!loading && (
        <div className="flex-1 flex flex-col justify-between space-y-4">
          {/* Stat cards — with icons matching reference UI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in shrink-0">
            <StatCard
              icon={
                <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                    <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                    <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
                  </svg>
                </div>
              }
              label="Portfolio Value"
              value={`$${fmt(summary?.total_value_usdt ?? 0)}`}
              sub="USDT-M Futures"
              loading={false}
            />
            <StatCard
              icon={
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
              }
              label="Realized PnL (MTD)"
              value={fmtPnl(pnlMtd)}
              sub="Month to date"
              valueClass={pnlPositive ? "pnl-positive" : "pnl-negative"}
              loading={false}
            />
            <StatCard
              icon={
                <div className="w-6 h-6 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="19" y1="5" x2="5" y2="19" />
                    <circle cx="6.5" cy="6.5" r="2.5" />
                    <circle cx="17.5" cy="17.5" r="2.5" />
                  </svg>
                </div>
              }
              label="Est. Monthly Fee"
              value={`$${fmt(estFee)}`}
              sub="20% of profit · display only"
              valueClass="text-muted-foreground"
              loading={false}
            />
            <StatCard
              icon={
                <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
              }
              label="Open Positions"
              value={summary?.open_positions ?? 0}
              sub={`${summary?.connected_accounts ?? 0} account(s) connected`}
              loading={false}
            />
          </div>

          {/* If no exchange connected, show full section matching reference design */}
          {noExchange ? (
            <NoExchangeSection />
          ) : (
            <>
              {/* Stale banner */}
              {summary && <StaleBanner freshness={summary.data_freshness} />}

              {/* Data freshness row */}
              {summary && (
                <div className="flex flex-wrap gap-2">
                  <FreshnessBadge item={summary.data_freshness.balances}  label="Balances" />
                  <FreshnessBadge item={summary.data_freshness.positions} label="Positions" />
                  <FreshnessBadge item={summary.data_freshness.trades}    label="Trades" />
                </div>
              )}

              {/* Open positions */}
              <div className="surface-card overflow-hidden">
                <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Open Positions</h2>
                  {positions.length > 0 && (
                    <span className="text-xs text-muted-foreground">{positions.length} positions</span>
                  )}
                </div>
                {positions.length > 0 ? (
                  <div className="divide-y divide-white/4 animate-fade-in">
                    {positions.map((p) => (
                      <PositionRow
                        key={p.id}
                        pos={p}
                        liveMarkPrice={prices[p.symbol]?.markPrice ?? null}
                        livePnl={calcEstLivePnl(p.symbol, p.entry_price, p.size, p.side)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No open positions
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
