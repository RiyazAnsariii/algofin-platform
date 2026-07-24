"use client";
// src/app/(app)/orders/page.tsx
// AlgoFin v2 — Orders Dashboard (matching reference UI)

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { cachedGet } from "@/lib/apiCache";
import { useOrderEvents } from "@/hooks/useOrderEvents";
import marketDataSocket from "@/lib/marketDataSocket";
import { useAuthStore } from "@/stores/auth.store";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// ── Types ─────────────────────────────────────────────────────────
interface Order {
  id:                 string;
  exchange_account_id: string;
  binance_order_id:   string | null;
  symbol:             string;
  side:               "BUY" | "SELL";
  order_type:         "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET";
  quantity:           string;
  price:              string | null;
  reduce_only:        boolean;
  time_in_force:      string | null;
  status:             string;
  filled_quantity:    string;
  avg_fill_price:     string | null;
  error_message:      string | null;
  placed_at:          string;
}

interface ExchangeAccount {
  id:          string;
  label:       string;
  exchange_id: string;
}

// ── Helpers ────────────────────────────────────────────────────────
const fmt = (n: string | number | null | undefined, d = 4) => {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};

const statusColor = (s: string) => {
  switch (s) {
    case "NEW":              return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    case "PARTIALLY_FILLED": return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "FILLED":           return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "CANCELLED":
    case "EXPIRED":          return "bg-muted/30 text-muted-foreground border-white/10";
    case "REJECTED":         return "bg-rose-500/15 text-rose-400 border-rose-500/20";
    default:                 return "bg-muted/30 text-muted-foreground border-white/10";
  }
};

// ── Main Orders page ──────────────────────────────────────────────────
export default function OrdersPage() {
  const [orders, setOrders]     = useState<Order[]>([]);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading]   = useState(true);
  const showSkeleton            = useDelayedLoading(loading);
  const accessToken             = useAuthStore((s) => s.accessToken);

  // Live order events via WebSocket
  const { liveOrders } = useOrderEvents();

  useEffect(() => {
    if (accessToken) marketDataSocket.connect(accessToken);
  }, [accessToken]);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await cachedGet<Order[]>("/orders", 10_000);
      setOrders(data);
    } catch {
      /* handled */
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await cachedGet<ExchangeAccount[]>("/exchanges", 30_000);
      setAccounts(data);
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const noAccounts = !loading && accounts.length === 0;

  // Stat counts
  const openCount = orders.filter((o) => o.status === "NEW" || o.status === "PARTIALLY_FILLED").length;
  const filledTodayCount = orders.filter((o) => o.status === "FILLED").length;
  const cancelledTodayCount = orders.filter((o) => o.status === "CANCELLED").length;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Place and manage orders across connected crypto exchanges
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Exchange status card */}
          <div className="px-3.5 py-1.5 rounded-xl border border-white/6 bg-white/[0.02] flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Exchange status</span>
            <span className="flex items-center gap-1.5 font-semibold text-rose-400">
              {noAccounts ? "Not connected" : "Connected"}
              <span className={`w-1.5 h-1.5 rounded-full ${noAccounts ? "bg-rose-400" : "bg-emerald-400 animate-pulse"}`} />
            </span>
          </div>

          {/* Need help card */}
          <div className="px-3.5 py-1.5 rounded-xl border border-white/6 bg-white/[0.02] flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Need help?</span>
            <Link href="/journal" className="flex items-center gap-1 font-semibold text-foreground hover:text-cyan-400 transition-colors">
              How orders work
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Hero Banner Card (When No Exchange Connected / Hero Overview) ── */}
      <div className="surface-card p-6 lg:p-8 rounded-2xl border border-white/8 bg-gradient-to-b from-cyan-500/[0.02] via-transparent to-transparent">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero side (7/12) */}
          <div className="lg:col-span-7 flex flex-col sm:flex-row items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-glow-cyan-sm">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M8 14h4" />
                <path d="M8 18h6" />
              </svg>
            </div>

            <div className="space-y-3">
              <div>
                <h2 className="text-xl font-bold text-foreground tracking-tight">No exchange account connected</h2>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Connect your exchange account to place orders, view open orders, order history, and manage your trades across supported platforms.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <Link
                  href="/exchanges"
                  className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-semibold transition-all shadow-glow-cyan transform hover:-translate-y-0.5"
                >
                  Connect account →
                </Link>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-cyan-400">
                    <path d="M12 2L3 7v6c0 4.97 3.84 9.63 9 11 5.16-1.37 9-6.03 9-11V7L12 2z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                  <span>Your API keys are encrypted and stored securely.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Checklist side (5/12) */}
          <div className="lg:col-span-5 space-y-3 lg:border-l lg:border-white/6 lg:pl-8">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Why connect your account?</h3>
            <div className="space-y-2.5">
              {[
                "Place and manage real orders",
                "View open & order history",
                "Track order status in real-time",
                "Cancel or modify existing orders",
                "Secure read & trade access",
              ].map((text, idx) => (
                <div key={idx} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="w-4 h-4 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Top 4 Stat Cards Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Open Orders */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Open Orders</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{openCount}</p>
            <p className="text-xs text-muted-foreground">{openCount > 0 ? `${openCount} active order(s)` : "No active orders"}</p>
          </div>
        </div>

        {/* Card 2: Filled (Today) */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Filled (Today)</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{filledTodayCount}</p>
            <p className="text-xs text-muted-foreground">{filledTodayCount > 0 ? `${filledTodayCount} filled order(s)` : "No filled orders"}</p>
          </div>
        </div>

        {/* Card 3: Cancelled (Today) */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Cancelled (Today)</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{cancelledTodayCount}</p>
            <p className="text-xs text-muted-foreground">{cancelledTodayCount > 0 ? `${cancelledTodayCount} cancelled order(s)` : "No cancelled orders"}</p>
          </div>
        </div>

        {/* Card 4: Total Order Value (Today) */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Order Value (Today)</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">$0.00 USDT</p>
            <p className="text-xs text-muted-foreground">Across all orders</p>
          </div>
        </div>
      </div>

      {/* ── Middle Row Grid (2 Columns) ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (~65% width): Recent Orders (Last 7 days) */}
        <div className="lg:col-span-8 surface-card p-5 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Recent Orders <span className="text-xs font-normal text-muted-foreground">(Last 7 days)</span></h3>
          </div>

          <div className="overflow-x-auto flex-1">
            <div className="min-w-[580px]">
              {/* Table Column Headers */}
              <div className="grid grid-cols-8 gap-2 px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-white/6">
                <span>Symbol</span>
                <span>Side</span>
                <span>Type</span>
                <span>Status</span>
                <span className="text-right">Price</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Filled</span>
                <span className="text-right">Time</span>
              </div>

              {/* Table Content / Empty State */}
              {showSkeleton ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="skeleton h-8 w-full" />)}
                </div>
              ) : orders.length > 0 ? (
                <div className="divide-y divide-white/4">
                  {orders.map((o) => (
                    <div key={o.id} className="grid grid-cols-8 gap-2 px-3 py-2.5 text-xs items-center hover:bg-white/2 transition-colors">
                      <span className="font-semibold text-foreground">{o.symbol}</span>
                      <span className={`font-bold ${o.side === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>{o.side}</span>
                      <span className="text-muted-foreground text-[11px]">{o.order_type}</span>
                      <div>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${statusColor(o.status)}`}>
                          {o.status}
                        </span>
                      </div>
                      <span className="text-right text-muted-foreground">${fmt(o.price, 2)}</span>
                      <span className="text-right text-foreground">{fmt(o.quantity, 4)}</span>
                      <span className="text-right text-muted-foreground">{fmt(o.filled_quantity, 4)}</span>
                      <span className="text-right text-muted-foreground text-[10px]">{new Date(o.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground/60 mb-1">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polyline points="21 8 21 21 3 21 3 8" />
                      <rect x="1" y="3" width="22" height="5" />
                      <line x1="10" y1="12" x2="14" y2="12" />
                    </svg>
                  </div>
                  <p className="font-semibold text-xs text-foreground">No orders yet</p>
                  <p className="text-[11px] text-muted-foreground max-w-xs">
                    Once you connect your account and place orders, they will appear here.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 text-center border-t border-white/6">
            <Link href="/orders" className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold inline-flex items-center gap-1 transition-colors">
              View all orders history →
            </Link>
          </div>
        </div>

        {/* Right Column (~35% width): Order Types You Can Place */}
        <div className="lg:col-span-4 surface-card p-5 space-y-4 flex flex-col justify-between">
          <h3 className="text-sm font-semibold text-foreground">Order Types You Can Place</h3>

          <div className="space-y-3 flex-1">
            {/* 1. Market Order */}
            <div className="p-3.5 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all flex items-center justify-between gap-3 group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-cyan-400 transition-colors">Market Order</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Buy or sell instantly at the best available market price.</p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            {/* 2. Limit Order */}
            <div className="p-3.5 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all flex items-center justify-between gap-3 group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-blue-400 transition-colors">Limit Order</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Buy or sell at a specific price or better.</p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            {/* 3. Stop Market Order */}
            <div className="p-3.5 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all flex items-center justify-between gap-3 group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-amber-400 transition-colors">Stop Market Order</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Market order triggered when stop price is reached.</p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>

            {/* 4. Take Profit / Stop Loss */}
            <div className="p-3.5 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all flex items-center justify-between gap-3 group cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-purple-400 transition-colors">Take Profit / Stop Loss</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">Set TP/SL to manage risk and lock in profits.</p>
                </div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground/40 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all shrink-0">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom API Security Banner ────────────────────────────── */}
      <div className="surface-card p-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.03] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 2L3 7v6c0 4.97 3.84 9.63 9 11 5.16-1.37 9-6.03 9-11V7L12 2z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-sm text-cyan-400">Secure & Reliable</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              We use read & trade permissions only. Your funds remain safe and under your control.
            </p>
          </div>
        </div>
        <Link
          href="/risk"
          className="shrink-0 px-4 py-2 rounded-xl border border-cyan-500/30 text-xs text-cyan-400 font-medium hover:bg-cyan-500/10 transition-all"
        >
          Learn more about API security →
        </Link>
      </div>
    </div>
  );
}
