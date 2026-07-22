"use client";
// src/app/(app)/strategy/page.tsx
// AlgoFin v2 — Phase F: Strategy Engine UI

import { useEffect, useState } from "react";
import api from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────
type ExchangeAccount = { id: string; exchange: string; label: string };

type Strategy = {
  id: string;
  name: string;
  description: string | null;
  strategy_type: string;
  status: string;
  symbol: string;
  order_side: string;
  order_type: string;
  quantity: string;
  limit_price: string | null;
  price_level: string | null;
  direction: string | null;
  max_executions: number | null;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
};

type Execution = {
  id: string;
  strategy_id: string;
  trigger_price: string | null;
  order_id: string | null;
  status: string;
  error: string | null;
  executed_at: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  active:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  stopped: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

const EXEC_STATUS_STYLES: Record<string, string> = {
  order_placed: "text-emerald-400",
  failed:       "text-rose-400",
  triggered:    "text-amber-400",
};

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style}`}>
      {label}
    </span>
  );
}

// ── Strategy card ──────────────────────────────────────────────────────────
function StrategyCard({
  strategy,
  onToggle,
  onDelete,
  onTrigger,
  onViewHistory,
}: {
  strategy: Strategy;
  onToggle: (id: string, newStatus: string) => void;
  onDelete: (id: string) => void;
  onTrigger: (id: string) => void;
  onViewHistory: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleTrigger = async () => {
    setBusy(true);
    try { await onTrigger(strategy.id); } finally { setBusy(false); }
  };

  return (
    <div className="bg-surface-1 border border-white/8 rounded-2xl p-5 space-y-3 hover:border-white/12 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-foreground truncate">{strategy.name}</h3>
            <Badge label={strategy.status} style={STATUS_STYLES[strategy.status] || ""} />
            <Badge
              label={strategy.strategy_type === "price_breakout" ? "Price Breakout" : "Manual"}
              style="bg-primary/10 text-primary border-primary/20"
            />
          </div>
          {strategy.description && (
            <p className="text-xs text-muted-foreground mt-1">{strategy.description}</p>
          )}
        </div>
      </div>

      {/* Params grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Symbol</p>
          <p className="font-mono text-foreground">{strategy.symbol}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Side / Type</p>
          <p className={`font-medium ${strategy.order_side === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>
            {strategy.order_side} {strategy.order_type}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Quantity</p>
          <p className="font-mono text-foreground">{strategy.quantity}</p>
        </div>
        {strategy.strategy_type === "price_breakout" && strategy.price_level ? (
          <div>
            <p className="text-muted-foreground">Trigger</p>
            <p className="font-mono text-cyan-400">
              {strategy.direction === "above" ? "≥" : "≤"} ${Number(strategy.price_level).toLocaleString()}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-muted-foreground">Executions</p>
            <p className="text-foreground">
              {strategy.execution_count}
              {strategy.max_executions ? ` / ${strategy.max_executions}` : ""}
            </p>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-white/6">
        <button
          onClick={handleTrigger}
          disabled={busy || strategy.status === "stopped"}
          className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20
            hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Triggering…" : "▶ Trigger Now"}
        </button>

        {strategy.status === "active" ? (
          <button
            onClick={() => onToggle(strategy.id, "paused")}
            className="text-xs px-3 py-1.5 rounded-lg border border-white/8 text-muted-foreground hover:text-foreground transition-colors"
          >
            Pause
          </button>
        ) : strategy.status === "paused" ? (
          <button
            onClick={() => onToggle(strategy.id, "active")}
            className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            Resume
          </button>
        ) : null}

        <button
          onClick={() => onViewHistory(strategy.id)}
          className="text-xs px-3 py-1.5 rounded-lg border border-white/8 text-muted-foreground hover:text-foreground transition-colors"
        >
          History
        </button>

        <button
          onClick={() => onDelete(strategy.id)}
          className="text-xs px-3 py-1.5 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 transition-colors ml-auto"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Create form ────────────────────────────────────────────────────────────
function CreateStrategyForm({
  accounts,
  onCreated,
  onCancel,
}: {
  accounts: ExchangeAccount[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    strategy_type: "price_breakout",
    exchange_account_id: accounts[0]?.id || "",
    symbol: "BTCUSDT",
    order_side: "BUY",
    order_type: "MARKET",
    quantity: "",
    limit_price: "",
    price_level: "",
    direction: "above",
    max_executions: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body: any = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        strategy_type: form.strategy_type,
        exchange_account_id: form.exchange_account_id,
        symbol: form.symbol.toUpperCase(),
        order_side: form.order_side,
        order_type: form.order_type,
        quantity: parseFloat(form.quantity),
        reduce_only: false,
        max_executions: form.max_executions ? parseInt(form.max_executions) : null,
      };
      if (form.order_type === "LIMIT") body.limit_price = parseFloat(form.limit_price);
      if (form.strategy_type === "price_breakout") {
        body.price_level = parseFloat(form.price_level);
        body.direction   = form.direction;
      }
      await api.post("/strategy", body);
      onCreated();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : JSON.stringify(detail));
    } finally {
      setLoading(false);
    }
  };

  const inp = (label: string, key: string, opts?: { type?: string; placeholder?: string }) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type={opts?.type || "text"}
        value={(form as any)[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={opts?.placeholder}
        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground
          placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30
          focus:border-primary/50 transition-all"
      />
    </div>
  );

  const sel = (label: string, key: string, options: { value: string; label: string }[]) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <select
        value={(form as any)[key]}
        onChange={e => set(key, e.target.value)}
        className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground
          focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  return (
    <div className="bg-surface-1 border border-white/8 rounded-2xl p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">New Strategy</h2>
        <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {inp("Strategy Name", "name", { placeholder: "BTC Long on breakout" })}
          {inp("Description (optional)", "description", { placeholder: "Short description" })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sel("Type", "strategy_type", [
            { value: "price_breakout", label: "Price Breakout — auto-fires when price crosses level" },
            { value: "manual",         label: "Manual — one-click order template" },
          ])}
          {sel("Exchange Account", "exchange_account_id",
            accounts.map(a => ({ value: a.id, label: `${a.exchange} — ${a.label}` }))
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {inp("Symbol", "symbol", { placeholder: "BTCUSDT" })}
          {sel("Side", "order_side", [
            { value: "BUY",  label: "BUY (Long)" },
            { value: "SELL", label: "SELL (Short)" },
          ])}
          {sel("Order Type", "order_type", [
            { value: "MARKET", label: "MARKET" },
            { value: "LIMIT",  label: "LIMIT" },
          ])}
          {inp("Quantity", "quantity", { type: "number", placeholder: "0.001" })}
        </div>

        {form.order_type === "LIMIT" && (
          <div className="grid grid-cols-2 gap-4">
            {inp("Limit Price ($)", "limit_price", { type: "number", placeholder: "95000" })}
          </div>
        )}

        {form.strategy_type === "price_breakout" && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {inp("Trigger Price Level ($)", "price_level", { type: "number", placeholder: "100000" })}
            {sel("Direction", "direction", [
              { value: "above", label: "Above (price ≥ level)" },
              { value: "below", label: "Below (price ≤ level)" },
            ])}
            {inp("Max Executions (blank = unlimited)", "max_executions", { type: "number", placeholder: "1" })}
          </div>
        )}

        {error && (
          <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
            hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating…" : "Create Strategy"}
        </button>
      </form>
    </div>
  );
}

// ── History modal ──────────────────────────────────────────────────────────
function HistoryPanel({
  strategyId,
  strategyName,
  onClose,
}: {
  strategyId: string;
  strategyName: string;
  onClose: () => void;
}) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: Execution[] }>(`/strategy/${strategyId}/history?limit=30`)
      .then(r => setExecutions(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [strategyId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-1 border border-white/8 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h3 className="font-semibold text-foreground">Executions — {strategyName}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : executions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No executions yet.</p>
          ) : executions.map(e => (
            <div key={e.id} className="flex items-start gap-4 p-3 bg-background border border-white/6 rounded-xl">
              <span className={`text-xs font-mono mt-0.5 ${EXEC_STATUS_STYLES[e.status] || "text-foreground"}`}>
                {e.status.toUpperCase()}
              </span>
              <div className="flex-1 text-xs space-y-0.5">
                <p className="text-muted-foreground">{new Date(e.executed_at).toLocaleString()}</p>
                {e.trigger_price && (
                  <p className="text-foreground">Trigger price: ${Number(e.trigger_price).toLocaleString()}</p>
                )}
                {e.order_id && (
                  <p className="text-muted-foreground">Order: <code>{e.order_id.slice(0, 8)}…</code></p>
                )}
                {e.error && <p className="text-rose-400">{e.error}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function StrategyPage() {
  const [strategies, setStrategies]     = useState<Strategy[]>([]);
  const [accounts, setAccounts]         = useState<ExchangeAccount[]>([]);
  const [showCreate, setShowCreate]     = useState(false);
  const [historyFor, setHistoryFor]     = useState<Strategy | null>(null);
  const [filter, setFilter]             = useState<string>("all");

  useEffect(() => {
    loadStrategies();
    loadAccounts();
  }, []);

  async function loadStrategies() {
    try {
      const res = await api.get<{ data: Strategy[] }>("/strategy");
      setStrategies(res.data.data);
    } catch { /* ignore */ }
  }

  async function loadAccounts() {
    try {
      const res = await api.get<{ data: ExchangeAccount[] }>("/exchanges");
      setAccounts(res.data.data || []);
    } catch { /* ignore */ }
  }

  const handleToggle = async (id: string, newStatus: string) => {
    await api.patch(`/strategy/${id}`, { status: newStatus });
    await loadStrategies();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this strategy?")) return;
    await api.delete(`/strategy/${id}`);
    await loadStrategies();
  };

  const handleTrigger = async (id: string) => {
    try {
      await api.post(`/strategy/${id}/trigger`);
      await loadStrategies();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Trigger failed");
    }
  };

  const filtered = filter === "all" ? strategies : strategies.filter(s => s.status === filter);
  const counts = {
    active:  strategies.filter(s => s.status === "active").length,
    paused:  strategies.filter(s => s.status === "paused").length,
    stopped: strategies.filter(s => s.status === "stopped").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Strategy Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automate order placement with price breakout triggers or manual one-click templates.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(v => !v)}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
            hover:bg-primary/90 active:scale-[0.98] transition-all flex-shrink-0"
        >
          {showCreate ? "Cancel" : "+ New Strategy"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active",  value: counts.active,  color: "text-emerald-400" },
          { label: "Paused",  value: counts.paused,  color: "text-amber-400" },
          { label: "Stopped", value: counts.stopped, color: "text-slate-400" },
        ].map(s => (
          <div key={s.label} className="bg-surface-1 border border-white/8 rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateStrategyForm
          accounts={accounts}
          onCreated={() => { setShowCreate(false); loadStrategies(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-surface-1 rounded-xl border border-white/8 w-fit">
        {["all", "active", "paused", "stopped"].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f} {f === "all" ? `(${strategies.length})` : ""}
          </button>
        ))}
      </div>

      {/* Strategy list */}
      {filtered.length === 0 ? (
        <div className="bg-surface-1 border border-white/8 rounded-2xl p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {filter === "all"
              ? "No strategies yet. Create one with the button above."
              : `No ${filter} strategies.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <StrategyCard
              key={s.id}
              strategy={s}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onTrigger={handleTrigger}
              onViewHistory={(id) => setHistoryFor(strategies.find(x => x.id === id) || null)}
            />
          ))}
        </div>
      )}

      {/* History modal */}
      {historyFor && (
        <HistoryPanel
          strategyId={historyFor.id}
          strategyName={historyFor.name}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}
