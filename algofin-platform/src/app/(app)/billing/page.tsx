"use client";
// src/app/(app)/billing/page.tsx
// AlgoFin v1 — Billing Summary (Phase F)
//
// UI wording rules (plan.md Section 5-A — HARD LOCKED):
//   CORRECT: "Estimated monthly fee" / "Current billing summary" / "AlgoFin billing estimate"
//   NEVER:   "Performance fee" / "Invoice" / "Amount due"
//
// Shadow billing: fees displayed for transparency — NOT collected in v1.

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { cachedGet } from "@/lib/apiCache";
import type { ProfitPeriod, PeriodStatus } from "@/types/billing";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// ── Helpers ───────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

const monthLabel = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long",
    year:  "numeric",
    timeZone: "UTC",
  });

const shortMonth = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    year:  "2-digit",
    timeZone: "UTC",
  });

// ── Status badge ──────────────────────────────────────────────────
const STATUS_MAP: Record<PeriodStatus, { label: string; cls: string }> = {
  open:         { label: "In progress",  cls: "badge-pending" },
  estimated:    { label: "Estimated",    cls: "badge-connected" },
  acknowledged: { label: "Acknowledged", cls: "badge-connected" },
  paid:         { label: "Paid",         cls: "badge-connected" },
  waived:       { label: "Waived",       cls: "badge-pending" },
  incomplete:   { label: "Incomplete",   cls: "badge-stale" },
};

function StatusBadge({ status }: { status: PeriodStatus }) {
  const { label, cls } = STATUS_MAP[status] ?? { label: status, cls: "badge-pending" };
  return <span className={cls}>{label}</span>;
}

// ── Fee ring ──────────────────────────────────────────────────────
function FeeRing({
  pnl,
  fee,
  rate,
}: {
  pnl:  number;
  fee:  number;
  rate: number;
}) {
  const profitable = pnl > 0;
  const pct = profitable ? Math.min((fee / pnl) * 100, 100) : 0;
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="144" height="144">
        {/* Track */}
        <circle cx="72" cy="72" r={r} fill="none" stroke="oklch(1 0 0 / 6%)" strokeWidth="10" />
        {/* Progress */}
        {profitable && (
          <circle
            cx="72" cy="72" r={r}
            fill="none"
            stroke="oklch(0.72 0.18 200)"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
            className="transition-all duration-700"
          />
        )}
      </svg>
      <div className="text-center relative z-10">
        <p className="text-2xl font-bold text-foreground">${fmt(fee)}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {profitable ? `${fmtPct(rate)} of profit` : "No fee"}
        </p>
      </div>
    </div>
  );
}

// ── Current period card ───────────────────────────────────────────
function CurrentPeriodCard({
  period,
  loading,
}: {
  period: ProfitPeriod | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="surface-card p-6 space-y-4">
        <div className="skeleton h-3 w-40" />
        <div className="skeleton h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (!period) {
    return (
      <div className="surface-card p-8 text-center text-sm text-muted-foreground">
        No billing data — connect an exchange account to start tracking.
      </div>
    );
  }

  const profitable = period.total_realized_pnl > 0;

  return (
    <div className="surface-card p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold text-foreground">Current billing summary</h2>
            <StatusBadge status={period.status} />
          </div>
          <p className="text-sm text-muted-foreground">{monthLabel(period.period_start)}</p>
        </div>
      </div>

      {/* Beta notice */}
      <div className="px-4 py-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
        <strong className="text-foreground">Estimate only — no payment collected during beta.</strong>
        {" "}These numbers are for transparency. AlgoFin does not charge fees in v1.
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Fee ring */}
        <div className="flex justify-center">
          <FeeRing
            pnl={period.total_realized_pnl}
            fee={period.performance_fee_amount}
            rate={period.performance_fee_rate}
          />
        </div>

        {/* Breakdown */}
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Realized PnL</span>
              <span className={`font-semibold ${profitable ? "pnl-positive" : "pnl-negative"}`}>
                {profitable ? "+" : ""}${fmt(period.total_realized_pnl)} USDT
              </span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Fee rate</span>
              <span className="font-medium text-foreground">{fmtPct(period.performance_fee_rate)}</span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-foreground">Estimated monthly fee</span>
              <span className={profitable ? "text-foreground" : "text-muted-foreground"}>
                ${fmt(period.performance_fee_amount)} USDT
              </span>
            </div>
          </div>

          {!profitable && (
            <div className="px-3 py-2 rounded-lg bg-emerald-500/8 border border-emerald-500/15 text-xs text-emerald-400">
              No fee this month — fees only apply to profitable periods.
            </div>
          )}

          {period.notes && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/15 text-xs text-amber-300">
              ⚠ {period.notes}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── History table ─────────────────────────────────────────────────
function HistoryTable({
  periods,
  loading,
}: {
  periods: ProfitPeriod[];
  loading: boolean;
}) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="px-5 py-4 border-b border-white/6">
        <h2 className="text-sm font-semibold text-foreground">Billing history</h2>
      </div>

      {loading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
      ) : periods.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No billing history yet.
        </div>
      ) : (
        <div className="divide-y divide-white/5">
          {/* Table head */}
          <div className="grid grid-cols-4 gap-4 px-5 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            <span>Period</span>
            <span className="text-right">Realized PnL</span>
            <span className="text-right">Est. monthly fee</span>
            <span className="text-right">Status</span>
          </div>
          {periods.map((p) => {
            const profitable = p.total_realized_pnl > 0;
            return (
              <div
                key={p.id}
                className="grid grid-cols-4 gap-4 px-5 py-3 text-sm hover:bg-white/2 transition-colors"
              >
                <span className="text-foreground font-medium">{shortMonth(p.period_start)}</span>
                <span className={`text-right font-medium ${profitable ? "pnl-positive" : "pnl-negative"}`}>
                  {profitable ? "+" : ""}${fmt(p.total_realized_pnl)}
                </span>
                <span className={`text-right ${profitable ? "text-foreground" : "text-muted-foreground"}`}>
                  ${fmt(p.performance_fee_amount)}
                </span>
                <div className="flex justify-end">
                  <StatusBadge status={p.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function BillingPage() {
  const [current, setCurrent]       = useState<ProfitPeriod | null>(null);
  const [history, setHistory]       = useState<ProfitPeriod[]>([]);
  const [loading, setLoading]       = useState(true);
  const showSkeleton                = useDelayedLoading(loading);

  const fetchData = useCallback(async () => {
    try {
      const [curRes, histRes] = await Promise.allSettled([
        cachedGet<ProfitPeriod>("/billing/periods/current", 45_000),
        cachedGet<ProfitPeriod[]>("/billing/periods", 45_000),
      ]);
      if (curRes.status === "fulfilled") setCurrent(curRes.value);
      if (histRes.status === "fulfilled") {
        const all = histRes.value;
        setHistory(all.length > 1 ? all.slice(1) : []);
      }
    } catch { /* ignore */ }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing summary</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estimated monthly fee based on your realized USDT-M Futures PnL
        </p>
      </div>

      {/* How it works callout */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: "Fee rate",     value: "20%",               sub: "of realized profit" },
          { label: "Billing cycle",value: "Monthly",           sub: "calendar month" },
          { label: "Applies when", value: "Profit only",       sub: "no fee in loss months" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="surface-card px-4 py-3 text-center space-y-0.5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-lg font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <CurrentPeriodCard period={current} loading={showSkeleton} />
      <HistoryTable periods={history} loading={showSkeleton} />
    </div>
  );
}
