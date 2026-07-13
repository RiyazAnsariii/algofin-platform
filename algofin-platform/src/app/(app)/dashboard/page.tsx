"use client";
// src/app/(app)/dashboard/page.tsx
// AlgoFin v1 — Dashboard: portfolio summary + positions + data_freshness

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { relativeTime } from "@/lib/staleness";

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
  label,
  value,
  sub,
  valueClass = "text-foreground",
  loading,
}: {
  label:      string;
  value:      React.ReactNode;
  sub?:       string;
  valueClass?: string;
  loading:    boolean;
}) {
  return (
    <div className="surface-card p-5 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 w-28 bg-muted/40 rounded animate-pulse" />
          {sub && <div className="h-3 w-20 bg-muted/30 rounded animate-pulse" />}
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

// ── Position row ──────────────────────────────────────────────────
function PositionRow({ pos }: { pos: Position }) {
  const pnlColor = pos.unrealized_pnl >= 0 ? "pnl-positive" : "pnl-negative";
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
        <span className={`font-semibold ${pnlColor}`}>
          {fmtPnl(pos.unrealized_pnl)}
        </span>
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
    <div className="px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-sm flex items-start gap-2">
      <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
      <span className="text-amber-300">
        <strong>Data may be outdated</strong> — {staleItems.join(", ")} data is stale.
        {" "}Syncing in the background.
      </span>
    </div>
  );
}

// ── No exchange banner ────────────────────────────────────────────
function NoExchangeBanner() {
  return (
    <div className="surface-card p-8 text-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-foreground">No exchange account connected</p>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your Binance Futures account to start tracking your portfolio.
        </p>
      </div>
      <a
        href="/exchanges"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground
          text-sm font-semibold hover:bg-primary/90 transition-all glow-cyan-sm"
      >
        Connect account →
      </a>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────
export default function DashboardPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [noExchange, setNoExchange] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, posRes] = await Promise.allSettled([
        api.get<{ data: PortfolioSummary }>("/portfolio/summary"),
        api.get<{ data: Position[] }>("/positions"),
      ]);

      if (summaryRes.status === "fulfilled") {
        const s = summaryRes.value.data.data;
        if (s.connected_accounts === 0) {
          setNoExchange(true);
        } else {
          setSummary(s);
          setNoExchange(false);
        }
      }
      if (posRes.status === "fulfilled") {
        setPositions(posRes.value.data.data);
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
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const pnlMtd = summary?.realized_pnl_mtd ?? 0;
  const pnlPositive = pnlMtd >= 0;
  const estFee = pnlMtd > 0 ? pnlMtd * 0.2 : 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              Binance USDT-M Futures overview
            </p>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground/60">
                · Updated {relativeTime(lastUpdated.toISOString())}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* No exchange */}
      {!loading && noExchange && <NoExchangeBanner />}

      {/* Stale banner */}
      {summary && <StaleBanner freshness={summary.data_freshness} />}

      {/* Stat cards */}
      {!noExchange && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Portfolio Value"
            value={`$${fmt(summary?.total_value_usdt ?? 0)}`}
            sub="USDT-M Futures"
            loading={loading}
          />
          <StatCard
            label="Realized PnL (MTD)"
            value={fmtPnl(pnlMtd)}
            sub="Month to date"
            valueClass={pnlPositive ? "pnl-positive" : "pnl-negative"}
            loading={loading}
          />
          <StatCard
            label="Est. Monthly Fee"
            value={`$${fmt(estFee)}`}
            sub="20% of profit · display only"
            valueClass="text-muted-foreground"
            loading={loading}
          />
          <StatCard
            label="Open Positions"
            value={summary?.open_positions ?? 0}
            sub={`${summary?.connected_accounts ?? 0} account(s) connected`}
            loading={loading}
          />
        </div>
      )}

      {/* Data freshness row */}
      {summary && !noExchange && (
        <div className="flex flex-wrap gap-2">
          <FreshnessBadge item={summary.data_freshness.balances}  label="Balances" />
          <FreshnessBadge item={summary.data_freshness.positions} label="Positions" />
          <FreshnessBadge item={summary.data_freshness.trades}    label="Trades" />
        </div>
      )}

      {/* Open positions */}
      {!noExchange && (
        <div className="surface-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Open Positions</h2>
            {positions.length > 0 && (
              <span className="text-xs text-muted-foreground">{positions.length} positions</span>
            )}
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-muted/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : positions.length > 0 ? (
            <div className="divide-y divide-white/4">
              {positions.map((p) => <PositionRow key={p.id} pos={p} />)}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No open positions
            </div>
          )}
        </div>
      )}
    </div>
  );
}
