"use client";
// src/app/(app)/billing/page.tsx
// AlgoFin v2 — Billing Summary & Analytics Dashboard (matching reference UI)

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
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

// ── Main Page ─────────────────────────────────────────────────────
export default function BillingPage() {
  const [current, setCurrent] = useState<ProfitPeriod | null>(null);
  const [history, setHistory] = useState<ProfitPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const showSkeleton          = useDelayedLoading(loading);

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
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pnl = current?.total_realized_pnl ?? 0;
  const fee = current?.performance_fee_amount ?? 0;
  const rate = current?.performance_fee_rate ?? 0.2;
  const profitable = pnl > 0;

  // Calculate current month days progress
  const now = new Date();
  const currentDay = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const progressPct = Math.min(Math.round((currentDay / totalDays) * 100), 100);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing summary</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Estimated monthly fee based on your realized USDT-M Futures PnL
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Last updated: 2m ago
          </span>
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
      </div>

      {/* ── Top 4 Stat Cards Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Fee Rate */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="19" y1="5" x2="5" y2="19" />
                <circle cx="6.5" cy="6.5" r="2.5" />
                <circle cx="17.5" cy="17.5" r="2.5" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">FEE RATE</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">20%</p>
            <p className="text-xs text-muted-foreground">of realized profit</p>
          </div>
        </div>

        {/* Card 2: Billing Cycle */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">BILLING CYCLE</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">Monthly</p>
            <p className="text-xs text-muted-foreground">calendar month</p>
          </div>
        </div>

        {/* Card 3: Applies When */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">APPLIES WHEN</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">Profit only</p>
            <p className="text-xs text-muted-foreground">no fee in loss months</p>
          </div>
        </div>

        {/* Card 4: Beta Status */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 2v7.31L4.75 20.5A1 1 0 0 0 5.6 22h12.8a1 1 0 0 0 .85-1.5L14 9.31V2" />
                <line x1="8.5" y1="2" x2="15.5" y2="2" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">BETA STATUS</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">In progress</p>
            <p className="text-xs text-muted-foreground">feature in beta</p>
          </div>
        </div>
      </div>

      {/* ── Middle Row: 2-Column Section ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Card (~65% width): Current billing summary */}
        <div className="lg:col-span-8 surface-card p-6 space-y-6 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-foreground">Current billing summary</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                In progress
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-4">
            {current ? monthLabel(current.period_start) : "July 2026"}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center pt-2">
            {/* Donut chart side */}
            <div className="md:col-span-5 flex flex-col items-center justify-center space-y-4">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" width="160" height="160">
                  <circle cx="80" cy="80" r="58" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/6" />
                  <circle
                    cx="80" cy="80" r="58"
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${profitable ? 120 : 60} 364`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="text-center relative z-10">
                  <p className="text-2xl font-bold text-foreground">${fmt(fee)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Estimated fee</p>
                  <p className="text-[10px] text-muted-foreground/60">{profitable ? `${fmtPct(rate)} of profit` : "No fee"}</p>
                </div>
              </div>

              {/* Alert Badge */}
              <div className="w-full px-3.5 py-2.5 rounded-xl bg-cyan-500/8 border border-cyan-500/20 flex items-start gap-2.5 text-xs text-cyan-400">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span className="leading-snug">
                  No fee this month — fees only apply to profitable periods.
                </span>
              </div>
            </div>

            {/* Breakdown side */}
            <div className="md:col-span-7 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Realized PnL</span>
                  <span className="font-semibold text-emerald-400">${fmt(pnl)} USDT</span>
                </div>
                <div className="h-px bg-white/6" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Fee rate</span>
                  <span className="font-medium text-foreground">20%</span>
                </div>
                <div className="h-px bg-white/6" />
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-foreground">Estimated monthly fee</span>
                  <span className="text-emerald-400">${fmt(fee)} USDT</span>
                </div>
                <div className="h-px bg-white/6" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Billing period</span>
                  <span className="text-foreground">Jul 1 – Jul 31, 2026</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Billing period progress</span>
                  <span className="font-medium text-foreground">{currentDay} / {totalDays} days</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div className="h-full bg-cyan-400 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Card (~35% width): Quick info */}
        <div className="lg:col-span-4 surface-card p-6 space-y-4 flex flex-col justify-between">
          <h2 className="text-base font-semibold text-foreground">Quick info</h2>
          <div className="divide-y divide-white/6 space-y-3">
            <div className="flex items-center justify-between pt-1 text-xs">
              <div className="space-y-0.5">
                <p className="font-semibold text-foreground">Exchange account</p>
                <p className="text-[11px] text-muted-foreground">Not connected</p>
              </div>
              <Link
                href="/exchanges"
                className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition-colors"
              >
                Connect account
              </Link>
            </div>

            <div className="flex items-center justify-between pt-3 text-xs">
              <span className="font-semibold text-foreground">Next billing date</span>
              <span className="text-muted-foreground">Aug 1, 2026</span>
            </div>

            <div className="flex items-center justify-between pt-3 text-xs">
              <span className="font-semibold text-foreground">Data source</span>
              <span className="text-muted-foreground">USDT-M Futures</span>
            </div>

            <div className="flex items-center justify-between pt-3 text-xs">
              <span className="font-semibold text-foreground">Calculation basis</span>
              <span className="text-muted-foreground">Realized PnL (closed trades)</span>
            </div>

            <div className="flex items-center justify-between pt-3 text-xs">
              <span className="font-semibold text-foreground">Fee currency</span>
              <span className="text-muted-foreground">USDT</span>
            </div>

            <div className="flex items-center justify-between pt-3 text-xs">
              <span className="font-semibold text-foreground">Need help?</span>
              <Link href="/journal" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                View billing guide ↗
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lower Grid: 3-Column Section ─────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-12 gap-5">
        {/* Card 1: Monthly PnL overview */}
        <div className="lg:col-span-4 surface-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Monthly PnL overview</h3>
          <div className="h-44 rounded-xl border border-white/6 bg-white/[0.01] p-3 flex flex-col justify-between relative overflow-hidden">
            {/* Axis Y lines & labels */}
            <div className="space-y-3.5 text-[9px] text-muted-foreground/50">
              <div className="flex items-center justify-between"><span>1,000</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
              <div className="flex items-center justify-between"><span>500</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
              <div className="flex items-center justify-between"><span>0</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
              <div className="flex items-center justify-between"><span>-500</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
              <div className="flex items-center justify-between"><span>-1,000</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
            </div>

            {/* Empty state overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-muted-foreground mb-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <p className="font-semibold text-xs text-foreground">No data yet</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Start trading to see your monthly performance.</p>
            </div>

            {/* X-axis months */}
            <div className="flex items-center justify-between text-[9px] text-muted-foreground/60 px-2 pt-1 border-t border-white/6">
              <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span>
            </div>
          </div>
        </div>

        {/* Card 2: Estimated fee trend */}
        <div className="lg:col-span-4 surface-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Estimated fee trend</h3>
          <div className="h-44 rounded-xl border border-white/6 bg-white/[0.01] p-3 flex flex-col justify-between relative overflow-hidden">
            {/* Axis Y lines & labels */}
            <div className="space-y-4 text-[9px] text-muted-foreground/50">
              <div className="flex items-center justify-between"><span>300</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
              <div className="flex items-center justify-between"><span>200</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
              <div className="flex items-center justify-between"><span>100</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
              <div className="flex items-center justify-between"><span>0</span><div className="w-full ml-2 border-b border-dashed border-white/5" /></div>
            </div>

            {/* Empty state overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-muted-foreground mb-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg>
              </div>
              <p className="font-semibold text-xs text-foreground">No data yet</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Fees will appear here once you have profitable months.</p>
            </div>

            {/* X-axis months */}
            <div className="flex items-center justify-between text-[9px] text-muted-foreground/60 px-2 pt-1 border-t border-white/6">
              <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span>
            </div>
          </div>
        </div>

        {/* Card 3: How AlgoFin billing works */}
        <div className="lg:col-span-4 surface-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">How AlgoFin billing works</h3>
          <div className="space-y-2.5">
            {[
              "Connect your exchange account securely",
              "Trade as usual on your exchange",
              "We calculate your realized PnL",
              "20% fee applies if your PnL is positive",
              "No fee if your PnL is zero or negative",
            ].map((step, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[11px] font-semibold flex items-center justify-center shrink-0">
                  {idx + 1}
                </span>
                <p className="text-xs text-muted-foreground leading-snug pt-0.5">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom Section: Billing History Table ─────────────────── */}
      <div className="surface-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/6 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Billing history</h3>
          <button className="px-3 py-1 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors">
            View all
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            {/* Table Header */}
            <div className="grid grid-cols-5 gap-4 px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-white/4">
              <span>MONTH</span>
              <span>REALIZED PNL (USDT)</span>
              <span>FEE RATE</span>
              <span>ESTIMATED FEE (USDT)</span>
              <span>STATUS</span>
            </div>

            {/* Table Content / Empty State */}
            {history.length > 0 ? (
              <div className="divide-y divide-white/4">
                {history.map((h) => (
                  <div key={h.id} className="grid grid-cols-5 gap-4 px-5 py-3 text-xs items-center hover:bg-white/2 transition-colors">
                    <span className="font-medium text-foreground">{shortMonth(h.period_start)}</span>
                    <span className={h.total_realized_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                      ${fmt(h.total_realized_pnl)}
                    </span>
                    <span className="text-muted-foreground">{fmtPct(h.performance_fee_rate)}</span>
                    <span className="font-semibold text-foreground">${fmt(h.performance_fee_amount)}</span>
                    <div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {h.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center space-y-1">
                <p className="font-semibold text-xs text-foreground">No billing history yet.</p>
                <p className="text-[11px] text-muted-foreground">Your monthly billing history will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
