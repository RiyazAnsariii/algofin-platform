"use client";
// src/app/(app)/journal/page.tsx
// AlgoFin v2 — Phase G: Trade Journal & Analytics

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

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
];

// ── Stat card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-surface-1 border border-white/8 rounded-xl p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${color || "text-foreground"}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ── Mini bar chart (pure CSS) ──────────────────────────────────────────────
function PnLChart({ data }: { data: DailyPnL[] }) {
  if (!data.length) return (
    <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
      No trade data for this period.
    </div>
  );

  // Cumulative line using SVG
  const values = data.map(d => parseFloat(d.cumulative_pnl));
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  const W = 600; const H = 120;
  const pts = data.map((_, i) => {
    const x = (i / (data.length - 1 || 1)) * W;
    const y = H - ((values[i] - min) / range) * H;
    return `${x},${y}`;
  });
  const zeroY = H - ((0 - min) / range) * H;
  const lastVal = values[values.length - 1] || 0;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-32" preserveAspectRatio="none">
        {/* Zero line */}
        <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 4" />
        {/* Fill */}
        <defs>
          <linearGradient id="pnl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lastVal >= 0 ? "#10b981" : "#f43f5e"} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lastVal >= 0 ? "#10b981" : "#f43f5e"} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,${H} ${pts.join(" ")} ${W},${H}`}
          fill="url(#pnl-fill)"
        />
        {/* Line */}
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={lastVal >= 0 ? "#10b981" : "#f43f5e"}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span>{data[0]?.date}</span>
        <span className={pnlColor(lastVal)}>
          {lastVal >= 0 ? "+" : ""}{fmt(lastVal)} USDT cumulative
        </span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

// ── Win/Loss pill bar ──────────────────────────────────────────────────────
function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses || 1;
  const winPct = (wins / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{wins} wins</span>
        <span>{losses} losses</span>
      </div>
      <div className="h-2 bg-white/8 rounded-full overflow-hidden flex">
        <div className="bg-emerald-500 rounded-full transition-all" style={{ width: `${winPct}%` }} />
        <div className="bg-rose-500 rounded-full flex-1 transition-all" />
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

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const body = {
        entry_date: form.entry_date,
        title: form.title.trim(),
        body: form.body.trim() || null,
        symbol: form.symbol.trim().toUpperCase() || null,
        tags: form.tags.split(",").map(t => t.trim()).filter(Boolean),
        mood: form.mood || null,
      };
      if (initial?.id) {
        await api.patch(`/journal/entries/${initial.id}`, body);
      } else {
        await api.post("/journal/entries", body);
      }
      onSave();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to save entry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface-1 border border-white/8 rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{initial?.id ? "Edit entry" : "New journal entry"}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors text-sm">Cancel</button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Date</label>
            <input type="date" value={form.entry_date} onChange={e => set("entry_date", e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-background border border-white/8 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Symbol (optional)</label>
            <input type="text" value={form.symbol} onChange={e => set("symbol", e.target.value)} placeholder="BTCUSDT"
              className="w-full px-3 py-2 rounded-xl text-sm bg-background border border-white/8 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Mood</label>
            <select value={form.mood} onChange={e => set("mood", e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-background border border-white/8 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all">
              <option value="">— none —</option>
              {Object.entries(MOOD_EMOJI).map(([m, e]) => (
                <option key={m} value={m}>{e} {m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tags (comma-sep)</label>
            <input type="text" value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="breakout, fomo"
              className="w-full px-3 py-2 rounded-xl text-sm bg-background border border-white/8 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Title</label>
          <input type="text" value={form.title} onChange={e => set("title", e.target.value)} placeholder="What happened today?"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all" />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Notes (markdown)</label>
          <textarea value={form.body} onChange={e => set("body", e.target.value)}
            rows={5} placeholder="Describe your trade rationale, mistakes, lessons learned…"
            className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground
              placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30
              transition-all resize-y font-mono" />
        </div>

        {error && <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2">{error}</p>}

        <button type="submit" disabled={loading || !form.title.trim()}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
            hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {loading ? "Saving…" : initial?.id ? "Update entry" : "Add entry"}
        </button>
      </form>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
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
      const res = await api.get<{ data: Analytics }>(`/journal/analytics?days=${d}`);
      setAnalytics(res.data.data);
    } catch { /* ignore */ } finally { setAnalyticsLoading(false); }
  }, []);

  const loadEntries = useCallback(async () => {
    try {
      const res = await api.get<{ data: JournalEntry[] }>("/journal/entries?limit=50");
      setEntries(res.data.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadAnalytics(period); }, [period, loadAnalytics]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this journal entry?")) return;
    await api.delete(`/journal/entries/${id}`);
    loadEntries();
  };

  const a = analytics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Journal & Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track your trading performance and document your thought process.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-1 rounded-xl border border-white/8 w-fit">
        {[
          { id: "analytics", label: "Analytics" },
          { id: "journal",   label: `Journal (${entries.length})` },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Analytics Tab ─────────────────────────────────────────────────── */}
      {activeTab === "analytics" && (
        <div className="space-y-5">
          {/* Period selector */}
          <div className="flex gap-1 p-1 bg-surface-1 rounded-xl border border-white/8 w-fit">
            {PERIOD_OPTIONS.map(p => (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  period === p.value ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                }`}>
                {p.label}
              </button>
            ))}
          </div>

          {analyticsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : !a ? (
            <p className="text-muted-foreground text-sm">Could not load analytics.</p>
          ) : (
            <>
              {/* PnL curve */}
              <div className="bg-surface-1 border border-white/8 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-foreground">Cumulative PnL — {period}D</h2>
                  <span className={`text-lg font-bold ${pnlColor(a.realized_pnl)}`}>
                    {Number(a.realized_pnl) >= 0 ? "+" : ""}{fmt(a.realized_pnl)} USDT
                  </span>
                </div>
                <PnLChart data={a.daily_pnl} />
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total Trades"    value={a.total_trades.toString()} />
                <StatCard label="Win Rate"        value={`${(a.win_rate * 100).toFixed(1)}%`}
                  sub={`${a.win_count}W / ${a.loss_count}L`}
                  color={a.win_rate >= 0.5 ? "text-emerald-400" : "text-rose-400"} />
                <StatCard label="Profit Factor"   value={a.profit_factor === 9999 ? "∞" : a.profit_factor.toFixed(2)}
                  color={a.profit_factor >= 1 ? "text-emerald-400" : "text-rose-400"} />
                <StatCard label="Net PnL"         value={`${Number(a.net_pnl) >= 0 ? "+" : ""}${fmt(a.net_pnl)}`}
                  sub="after commission" color={pnlColor(a.net_pnl)} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Avg Win"         value={`+${fmt(a.avg_win)}`} color="text-emerald-400" />
                <StatCard label="Avg Loss"        value={fmt(a.avg_loss)} color="text-rose-400" />
                <StatCard label="Best Day"        value={`+${fmt(a.best_day_pnl)}`} color="text-emerald-400" />
                <StatCard label="Worst Day"       value={fmt(a.worst_day_pnl)} color="text-rose-400" />
              </div>

              {/* Win/loss bar */}
              <div className="bg-surface-1 border border-white/8 rounded-2xl p-5">
                <h2 className="font-semibold text-foreground mb-3">Win / Loss ratio</h2>
                <WinLossBar wins={a.win_count} losses={a.loss_count} />
                <div className="grid grid-cols-3 gap-4 mt-4 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Best single trade</p>
                    <p className="text-emerald-400 font-semibold">+{fmt(a.max_single_win)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Avg trade</p>
                    <p className={`font-semibold ${pnlColor(a.avg_trade)}`}>{fmt(a.avg_trade)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Worst single trade</p>
                    <p className="text-rose-400 font-semibold">{fmt(a.max_single_loss)}</p>
                  </div>
                </div>
              </div>

              {/* Symbol breakdown */}
              {a.by_symbol.length > 0 && (
                <div className="bg-surface-1 border border-white/8 rounded-2xl p-5">
                  <h2 className="font-semibold text-foreground mb-3">By Symbol</h2>
                  <div className="space-y-2">
                    {a.by_symbol.map(s => (
                      <div key={s.symbol} className="flex items-center gap-4 py-2 border-b border-white/6 last:border-0">
                        <span className="font-mono text-sm text-foreground w-24 flex-shrink-0">{s.symbol}</span>
                        <div className="flex-1">
                          <div className="h-1.5 bg-white/8 rounded-full overflow-hidden flex">
                            <div className="bg-emerald-500 rounded-full" style={{ width: `${s.win_rate * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground w-16 text-right">{s.trade_count} trades</span>
                        <span className={`text-sm font-semibold w-24 text-right ${pnlColor(s.realized_pnl)}`}>
                          {Number(s.realized_pnl) >= 0 ? "+" : ""}{fmt(s.realized_pnl)}
                        </span>
                        <span className="text-xs text-muted-foreground w-12 text-right">
                          {(s.win_rate * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Journal Tab ───────────────────────────────────────────────────── */}
      {activeTab === "journal" && (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{entries.length} entries</p>
            <button onClick={() => { setEditEntry(null); setShowForm(v => !v); }}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
                hover:bg-primary/90 active:scale-[0.98] transition-all">
              {showForm ? "Cancel" : "+ New Entry"}
            </button>
          </div>

          {/* Create / Edit form */}
          {(showForm || editEntry) && (
            <EntryForm
              initial={editEntry || undefined}
              onSave={() => { setShowForm(false); setEditEntry(null); loadEntries(); }}
              onCancel={() => { setShowForm(false); setEditEntry(null); }}
            />
          )}

          {/* Entries list */}
          {entries.length === 0 ? (
            <div className="bg-surface-1 border border-white/8 rounded-2xl p-12 text-center">
              <p className="text-muted-foreground text-sm">No journal entries yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Document your trades, emotions and lessons.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map(entry => (
                <div key={entry.id}
                  className="bg-surface-1 border border-white/8 rounded-2xl p-5 space-y-3 hover:border-white/12 transition-all">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.mood && (
                          <span className="text-lg" title={entry.mood}>{MOOD_EMOJI[entry.mood] || ""}</span>
                        )}
                        <h3 className="font-semibold text-foreground">{entry.title}</h3>
                        {entry.symbol && (
                          <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">
                            {entry.symbol}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(entry.entry_date).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => { setEditEntry(entry); setShowForm(false); }}
                        className="text-xs px-3 py-1 rounded-lg border border-white/8 text-muted-foreground hover:text-foreground transition-colors">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(entry.id)}
                        className="text-xs px-3 py-1 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Body preview */}
                  {entry.body && (
                    <p className="text-sm text-muted-foreground line-clamp-3 font-mono whitespace-pre-wrap">
                      {entry.body}
                    </p>
                  )}

                  {/* Tags */}
                  {entry.tags.length > 0 && (
                    <div className="flex gap-1.5 flex-wrap">
                      {entry.tags.map(tag => (
                        <span key={tag} className="text-xs px-2 py-0.5 bg-white/5 border border-white/8 rounded-full text-muted-foreground">
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
