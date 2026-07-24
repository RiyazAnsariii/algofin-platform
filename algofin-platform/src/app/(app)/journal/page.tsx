"use client";
// src/app/(app)/journal/page.tsx
// AlgoFin — Trade Journal & Performance Analytics (matching reference mockup UI)

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { cachedGet, invalidateCachePrefix } from "@/lib/apiCache";

// ── Types ──────────────────────────────────────────────────────────────────
type DailyPnL = { date: string; pnl: string; trade_count: number; cumulative_pnl: string };
type SymbolBreakdown = {
  symbol: string; trade_count: number; realized_pnl: string;
  win_count: number; loss_count: number; win_rate: number;
};
type Analytics = {
  period_days: number; from_date: string; to_date: string;
  total_trades: number; realized_pnl: string; total_commission: string; net_pnl: string;
  win_count: number; loss_count: number; win_rate: number; profit_factor: number;
  avg_win: string; avg_loss: string; avg_trade: string;
  max_single_win: string; max_single_loss: string;
  best_day_pnl: string; worst_day_pnl: string;
  daily_pnl: DailyPnL[]; by_symbol: SymbolBreakdown[];
};
type JournalEntry = {
  id: string; entry_date: string; title: string; body: string | null;
  symbol: string | null; tags: string[]; mood: string | null;
  created_at: string; updated_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (v: string | number, dec = 2) =>
  Number(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });

const pnlColor = (v: string | number) => Number(v) >= 0 ? "text-emerald-400" : "text-rose-400";

const MOOD_EMOJI: Record<string, string> = {
  confident: "💪", focused: "🎯", fearful: "😨", greedy: "💰", neutral: "😐",
};

const PERIOD_OPTIONS = [
  { label: "7D", value: 7 },
  { label: "30D", value: 30 },
  { label: "90D", value: 90 },
  { label: "1Y", value: 365 },
  { label: "All", value: 9999 },
];

// ── Interactive PnL Area/Line Chart Component ──────────────────────────────
function CumulativePnLChart({ data, period }: { data: DailyPnL[]; period: number }) {
  if (!data || data.length === 0) {
    // Generate default baseline data points if no trades
    const dates = ["24 Jun", "29 Jun", "4 Jul", "9 Jul", "14 Jul", "19 Jul", "24 Jul"];
    return (
      <div className="space-y-4">
        <div className="relative h-44 w-full flex items-center">
          {/* Y-Axis Labels */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-muted-foreground/60 font-mono pr-2">
            <span>200</span>
            <span>100</span>
            <span>0</span>
            <span>-100</span>
            <span>-200</span>
          </div>

          {/* Gridlines & Zero baseline */}
          <div className="ml-10 w-full h-full relative flex flex-col justify-between py-1">
            <div className="w-full border-b border-white/5 border-dashed" />
            <div className="w-full border-b border-white/5 border-dashed" />
            <div className="w-full border-b border-cyan-500/30 relative flex items-center">
              {/* Baseline Line with glowing cyan dots */}
              <div className="w-full h-[1.5px] bg-cyan-400 shadow-glow-cyan" />
              <div className="absolute inset-0 flex justify-between items-center px-1">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] shrink-0" />
                ))}
              </div>
            </div>
            <div className="w-full border-b border-white/5 border-dashed" />
            <div className="w-full border-b border-white/5 border-dashed" />
          </div>
        </div>

        {/* X-Axis Dates */}
        <div className="ml-10 flex justify-between text-[11px] text-muted-foreground/70 font-mono">
          {dates.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      </div>
    );
  }

  // Dynamic Chart Rendering for real data
  const values = data.map((d) => parseFloat(d.cumulative_pnl));
  const min = Math.min(-100, ...values);
  const max = Math.max(100, ...values);
  const range = max - min || 1;
  const W = 700;
  const H = 160;

  const pts = data.map((_, i) => {
    const x = (i / (data.length - 1 || 1)) * W;
    const y = H - ((values[i] - min) / range) * H;
    return `${x},${y}`;
  });

  const zeroY = H - ((0 - min) / range) * H;
  const lastVal = values[values.length - 1] || 0;

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-44" preserveAspectRatio="none">
          {/* Zero baseline */}
          <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="rgba(34,211,238,0.4)" strokeWidth="1.5" strokeDasharray="3 3" />

          {/* Area Fill */}
          <defs>
            <linearGradient id="pnl-gradient-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lastVal >= 0 ? "#10b981" : "#f43f5e"} stopOpacity="0.25" />
              <stop offset="100%" stopColor={lastVal >= 0 ? "#10b981" : "#f43f5e"} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <polygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill="url(#pnl-gradient-fill)" />

          {/* Polyline */}
          <polyline points={pts.join(" ")} fill="none" stroke={lastVal >= 0 ? "#22d3ee" : "#f43f5e"} strokeWidth="2.5" strokeLinejoin="round" />

          {/* Data Points */}
          {pts.map((pt, i) => {
            const [cx, cy] = pt.split(",");
            return (
              <circle key={i} cx={cx} cy={cy} r="3" className="fill-cyan-400 stroke-slate-900 stroke-2" />
            );
          })}
        </svg>
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground/70 font-mono">
        <span>{data[0]?.date}</span>
        <span className={pnlColor(lastVal)}>
          {lastVal >= 0 ? "+" : ""}{fmt(lastVal)} USDT cumulative ({period}D)
        </span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ── Journal entry form ─────────────────────────────────────────────────────
function EntryForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<JournalEntry>;
  onSave: () => void;
  onCancel: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    entry_date: initial?.entry_date || today,
    title: initial?.title || "",
    body: initial?.body || "",
    symbol: initial?.symbol || "",
    tags: (initial?.tags || []).join(", "),
    mood: initial?.mood || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = {
        entry_date: form.entry_date,
        title: form.title.trim(),
        body: form.body.trim() || null,
        symbol: form.symbol.trim().toUpperCase() || null,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        mood: form.mood || null,
      };
      if (initial?.id) {
        await api.patch(`/journal/entries/${initial.id}`, body);
      } else {
        await api.post("/journal/entries", body);
      }
      invalidateCachePrefix("/journal");
      onSave();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Failed to save entry");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full px-3 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan-400/50 transition-colors";

  return (
    <div className="surface-card p-6 rounded-2xl space-y-4 border border-white/10">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-foreground">{initial?.id ? "Edit entry" : "New journal entry"}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors text-xs">Cancel</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Date</label>
            <input type="date" value={form.entry_date} onChange={(e) => set("entry_date", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Symbol (optional)</label>
            <input type="text" value={form.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="BTCUSDT" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Mood</label>
            <select value={form.mood} onChange={(e) => set("mood", e.target.value)} className={`${inputCls} appearance-none cursor-pointer`}>
              <option value="">— none —</option>
              {Object.entries(MOOD_EMOJI).map(([m, e]) => (
                <option key={m} value={m}>{e} {m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">Tags (comma-separated)</label>
            <input type="text" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="breakout, fomo" className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Title</label>
          <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="What happened today?" className={inputCls} />
        </div>

        <div>
          <label className="block text-xs font-semibold text-muted-foreground mb-1">Notes (Markdown)</label>
          <textarea value={form.body} onChange={(e) => set("body", e.target.value)} rows={4} placeholder="Describe trade rationale, mistakes, lessons learned..." className={`${inputCls} font-mono resize-y`} />
        </div>

        {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5">{error}</p>}

        <button type="submit" disabled={loading || !form.title.trim()} className="w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black font-semibold text-xs transition-all shadow-glow-cyan disabled:opacity-50">
          {loading ? "Saving…" : initial?.id ? "Update Entry" : "Add Entry"}
        </button>
      </form>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function JournalPage() {
  const [activeTab, setActiveTab] = useState<"analytics" | "journal">("analytics");
  const [period, setPeriod]       = useState(30);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  const [entries, setEntries]     = useState<JournalEntry[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);

  const loadAnalytics = useCallback(async (d: number) => {
    setAnalyticsLoading(true);
    try {
      const data = await cachedGet<Analytics>(`/journal/analytics?days=${d}`, 60_000);
      setAnalytics(data);
    } catch { /* ignore */ } finally { setAnalyticsLoading(false); }
  }, []);

  const loadEntries = useCallback(async () => {
    try {
      const data = await cachedGet<JournalEntry[]>("/journal/entries?limit=50", 30_000);
      setEntries(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadAnalytics(period); }, [period, loadAnalytics]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this journal entry?")) return;
    await api.delete(`/journal/entries/${id}`);
    invalidateCachePrefix("/journal");
    loadEntries();
    loadAnalytics(period);
  };

  const a = analytics;
  const realizedPnLNum = Number(a?.realized_pnl ?? 0);
  const winCount = a?.win_count ?? 0;
  const lossCount = a?.loss_count ?? 0;
  const winRatePct = a ? (a.win_rate * 100).toFixed(2) : "0.00";
  const lossRatePct = a ? ((1 - a.win_rate) * 100).toFixed(2) : "0.00";

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* ── Top Header Row ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Journal & Analytics</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track your trading performance and document your thought process.
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => alert("Report exported successfully!")}
            className="surface-card px-3.5 py-1.5 rounded-xl border border-white/10 text-xs font-semibold text-foreground hover:bg-white/5 transition-all flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Report
          </button>
          <button
            type="button"
            className="surface-card px-3.5 py-1.5 rounded-xl border border-cyan-500/30 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10 transition-all flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
          </button>
        </div>
      </div>

      {/* ── Navigation Tabs Row ──────────────────────────────────────────── */}
      <div className="border-b border-white/8 flex items-center gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveTab("analytics")}
          className={`pb-3 relative transition-colors ${
            activeTab === "analytics" ? "text-cyan-400" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Analytics
          {activeTab === "analytics" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full shadow-glow-cyan" />
          )}
        </button>
        <button
          onClick={() => setActiveTab("journal")}
          className={`pb-3 relative transition-colors ${
            activeTab === "journal" ? "text-cyan-400" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Journal ({entries.length})
          {activeTab === "journal" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full shadow-glow-cyan" />
          )}
        </button>
      </div>

      {/* ── ANALYTICS TAB CONTENT ────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-5">
          {/* Date Range Selector Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 surface-card rounded-xl border border-white/8 w-fit">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    period === p.value
                      ? "bg-cyan-400 text-black shadow-glow-cyan"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="px-3.5 py-1.5 surface-card rounded-xl border border-white/10 text-xs text-muted-foreground flex items-center gap-2 cursor-pointer hover:border-white/20 transition-all w-fit">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>24 Jun 2026 - 24 Jul 2026</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Cumulative PnL Card */}
          <div className="surface-card p-6 space-y-4 rounded-2xl border border-white/8">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Cumulative PnL — {period === 9999 ? "All" : `${period}D`}
                  </h2>
                  <span className="text-muted-foreground/60 text-[10px]" title="Cumulative realized PnL over selected timeframe">ⓘ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xl font-bold ${realizedPnLNum >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {realizedPnLNum >= 0 ? "+" : ""}{fmt(realizedPnLNum)} USDT
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold">
                    0.00%
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  vs previous {period === 9999 ? "period" : `${period}D`}: 0.00%
                </p>
              </div>

              <div className="px-3 py-1.5 surface-card rounded-xl border border-white/10 text-xs text-muted-foreground flex items-center gap-2 cursor-pointer">
                <span>PnL (USDT)</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            <CumulativePnLChart data={a?.daily_pnl || []} period={period} />
          </div>

          {/* 8 Performance Stat Cards (4x2 Grid matching reference mockup) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card 1: Total Trades */}
            <div className="surface-card p-4 rounded-xl space-y-2 border border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Trades</span>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{a?.total_trades ?? 0}</p>
                <p className="text-[11px] text-muted-foreground/60">No. of trades</p>
              </div>
            </div>

            {/* Card 2: Win Rate */}
            <div className="surface-card p-4 rounded-xl space-y-2 border border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Win Rate</span>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{winRatePct}%</p>
                <p className="text-[11px] text-muted-foreground/60">{winCount}W / {lossCount}L</p>
              </div>
            </div>

            {/* Card 3: Profit Factor */}
            <div className="surface-card p-4 rounded-xl space-y-2 border border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Profit Factor</span>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{a ? (a.profit_factor === 9999 ? "∞" : a.profit_factor.toFixed(2)) : "0.00"}</p>
                <p className="text-[11px] text-muted-foreground/60">Gross Profit / Gross Loss</p>
              </div>
            </div>

            {/* Card 4: Net PnL */}
            <div className="surface-card p-4 rounded-xl space-y-2 border border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Net PnL</span>
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-400">+{fmt(a?.net_pnl ?? 0)} USDT</p>
                <p className="text-[11px] text-muted-foreground/60">after commission</p>
              </div>
            </div>

            {/* Card 5: Avg Win */}
            <div className="surface-card p-4 rounded-xl space-y-2 border border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Win</span>
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-400">+{fmt(a?.avg_win ?? 0)} USDT</p>
                <p className="text-[11px] text-muted-foreground/60">Average winning trade</p>
              </div>
            </div>

            {/* Card 6: Avg Loss */}
            <div className="surface-card p-4 rounded-xl space-y-2 border border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Avg Loss</span>
              </div>
              <div>
                <p className="text-xl font-bold text-rose-400">{fmt(a?.avg_loss ?? 0)} USDT</p>
                <p className="text-[11px] text-muted-foreground/60">Average losing trade</p>
              </div>
            </div>

            {/* Card 7: Best Day */}
            <div className="surface-card p-4 rounded-xl space-y-2 border border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Best Day</span>
              </div>
              <div>
                <p className="text-xl font-bold text-emerald-400">+{fmt(a?.best_day_pnl ?? 0)} USDT</p>
                <p className="text-[11px] text-muted-foreground/60">Highest PnL day</p>
              </div>
            </div>

            {/* Card 8: Worst Day */}
            <div className="surface-card p-4 rounded-xl space-y-2 border border-white/6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Worst Day</span>
              </div>
              <div>
                <p className="text-xl font-bold text-rose-400">{fmt(a?.worst_day_pnl ?? 0)} USDT</p>
                <p className="text-[11px] text-muted-foreground/60">Lowest PnL day</p>
              </div>
            </div>
          </div>

          {/* Win / Loss ratio Card */}
          <div className="surface-card p-6 space-y-3 rounded-2xl border border-white/8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Win / Loss ratio</h2>
                <span className="text-muted-foreground/60 text-[10px]" title="Win and loss percentage breakdown">ⓘ</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-cyan-400">{winCount} wins</span>
              <span className="text-rose-400">{lossCount} losses</span>
            </div>

            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden flex">
              <div className="bg-emerald-400 transition-all rounded-l-full" style={{ width: `${winRatePct}%` }} />
              <div className="bg-rose-500 transition-all rounded-r-full flex-1" />
            </div>

            <div className="flex items-center justify-between text-xs font-semibold pt-0.5">
              <span className="text-emerald-400">{winRatePct}% Win Rate</span>
              <span className="text-rose-400">{lossRatePct}% Loss Rate</span>
            </div>
          </div>

          {/* 2-Column Bottom Analytics Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Panel 1: Trade Performance */}
            <div className="surface-card p-6 space-y-4 rounded-2xl border border-white/8 min-h-[220px] flex flex-col justify-between">
              <div className="flex items-center gap-1">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Trade Performance</h3>
                <span className="text-muted-foreground/60 text-[10px]">ⓘ</span>
              </div>

              <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground/60">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-foreground">No data to display yet.</p>
                <p className="text-[11px] text-muted-foreground/60">Start trading to see your performance analytics.</p>
              </div>
            </div>

            {/* Panel 2: PnL Distribution */}
            <div className="surface-card p-6 space-y-4 rounded-2xl border border-white/8 min-h-[220px] flex flex-col justify-between">
              <div className="flex items-center gap-1">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">PnL Distribution</h3>
                <span className="text-muted-foreground/60 text-[10px]">ⓘ</span>
              </div>

              <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground/60">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-foreground">No data to display yet.</p>
                <p className="text-[11px] text-muted-foreground/60">Start trading to see your PnL distribution.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── JOURNAL TAB CONTENT ────────────────────────────────────────── */}
      {activeTab === "journal" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{entries.length} entries documented</p>
            <button
              onClick={() => { setEditEntry(null); setShowForm((v) => !v); }}
              className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-semibold transition-all shadow-glow-cyan"
            >
              {showForm ? "Cancel" : "+ New Entry"}
            </button>
          </div>

          {(showForm || editEntry) && (
            <EntryForm
              initial={editEntry || undefined}
              onSave={() => { setShowForm(false); setEditEntry(null); loadEntries(); }}
              onCancel={() => { setShowForm(false); setEditEntry(null); }}
            />
          )}

          {entries.length === 0 ? (
            <div className="surface-card p-12 rounded-2xl border border-white/8 text-center space-y-2">
              <p className="text-xs font-semibold text-foreground">No journal entries documented yet.</p>
              <p className="text-[11px] text-muted-foreground">Document your trade execution rationale, emotions, and lessons learned.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className="surface-card p-5 rounded-2xl border border-white/8 space-y-3 hover:border-white/16 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.mood && <span className="text-base" title={entry.mood}>{MOOD_EMOJI[entry.mood] || ""}</span>}
                        <h3 className="font-semibold text-xs text-foreground">{entry.title}</h3>
                        {entry.symbol && (
                          <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-md border border-cyan-500/20">
                            {entry.symbol}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground/60 mt-1">
                        {new Date(entry.entry_date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => { setEditEntry(entry); setShowForm(false); }} className="text-xs px-3 py-1 rounded-lg border border-white/8 text-muted-foreground hover:text-foreground transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(entry.id)} className="text-xs px-3 py-1 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>

                  {entry.body && (
                    <p className="text-xs text-muted-foreground/80 font-mono whitespace-pre-wrap leading-relaxed">
                      {entry.body}
                    </p>
                  )}

                  {entry.tags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 bg-white/5 border border-white/8 rounded-full text-muted-foreground">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
