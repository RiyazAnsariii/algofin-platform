"use client";
// src/app/(app)/strategy/webhook/page.tsx
// AlgoFin v2 — Phase M: TradingView Webhook Strategy Builder

import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// ── Types ───────────────────────────────────────────────────────────────────

type ExchangeAccount = { id: string; exchange: string; label: string };

type WebhookStrategy = {
  id: string;
  name: string;
  description: string | null;
  strategy_type: string;
  status: string;
  symbol: string;
  timeframe: string | null;
  quantity: string | null;
  reduce_only: boolean;
  is_test_mode: boolean;
  current_version: number;
  pine_code: string | null;
  max_executions: number | null;
  execution_count: number;
  webhook_url: string | null;
  created_at: string;
};

type Signal = {
  id: string;
  action: string;
  ticker: string;
  contracts: string | null;
  price: string | null;
  status: string;
  is_test: boolean;
  error: string | null;
  processing_duration_ms: number | null;
  received_at: string;
  processed_at: string | null;
};

type ExecRecord = {
  id: string;
  signal_id: string;
  risk_result: string;
  order_id: string | null;
  execution_latency_ms: number | null;
  created_at: string;
};

type PineVersion = {
  id: string;
  version_number: number;
  pine_code: string;
  created_at: string;
};

// ── Status helpers ───────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  draft:    "bg-slate-500",
  active:   "bg-emerald-400",
  paused:   "bg-amber-400",
  stopped:  "bg-slate-400",
  archived: "bg-red-500",
};

const STATUS_PILL: Record<string, string> = {
  draft:    "bg-slate-500/10 text-slate-400 border-slate-500/20",
  active:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  paused:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  stopped:  "bg-slate-500/10 text-slate-400 border-slate-500/20",
  archived: "bg-red-500/10 text-red-400 border-red-500/20",
};

const SIGNAL_STATUS_COLOR: Record<string, string> = {
  QUEUED:           "text-slate-400",
  PROCESSING:       "text-cyan-400",
  ORDER_SUBMITTED:  "text-emerald-400",
  RISK_BLOCKED:     "text-amber-400",
  STRATEGY_PAUSED:  "text-amber-400",
  FAILED:           "text-rose-400",
  TIMEOUT:          "text-rose-400",
  DUPLICATE:        "text-slate-400",
};

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${style}`}>
      {label}
    </span>
  );
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={copy}
      className="text-xs px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20
        hover:bg-primary/20 transition-all active:scale-95 flex-shrink-0"
    >
      {copied ? "✓ Copied!" : label}
    </button>
  );
}

// ── Secret reveal modal ──────────────────────────────────────────────────────

function SecretModal({
  secret,
  webhookUrl,
  onClose,
}: {
  secret: string;
  webhookUrl: string;
  onClose: () => void;
}) {
  const tvTemplate = JSON.stringify({
    secret,
    action: "{{strategy.order.action}}",
    ticker: "{{ticker}}",
    contracts: "{{strategy.order.contracts}}",
    price: "{{close}}",
    time: "{{timenow}}",
  }, null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface-1 border border-amber-500/30 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-white/8 flex items-center gap-3">
          <span className="text-2xl">🔑</span>
          <div>
            <h3 className="font-bold text-foreground">Webhook Secret Generated</h3>
            <p className="text-xs text-amber-400 mt-0.5">Store this immediately — shown only once</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Secret */}
          <div className="bg-background border border-amber-500/20 rounded-xl p-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Secret</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-amber-300 break-all">{secret}</code>
              <CopyButton text={secret} />
            </div>
          </div>

          {/* Webhook URL */}
          <div className="bg-background border border-white/8 rounded-xl p-4 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Webhook URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-foreground break-all">{webhookUrl}</code>
              <CopyButton text={webhookUrl} />
            </div>
          </div>

          {/* TradingView alert template */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              TradingView Alert Message Template
            </p>
            <div className="relative">
              <pre className="bg-background border border-white/8 rounded-xl p-4 text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                {tvTemplate}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={tvTemplate} label="Copy Template" />
              </div>
            </div>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
            <p className="text-xs text-amber-400">
              ⚠️ <strong>This secret will never be shown again.</strong> Copy it now and paste it into
              your TradingView alert message body. Losing this secret requires a rotation.
            </p>
          </div>
        </div>

        <div className="p-5 border-t border-white/8">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold
              hover:bg-primary/90 transition-all active:scale-[0.98]"
          >
            I've Saved the Secret
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Signal history panel ─────────────────────────────────────────────────────

function SignalHistoryPanel({ strategyId, onClose }: { strategyId: string; onClose: () => void }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: Signal[] }>(`/strategy/${strategyId}/signals?limit=50`)
      .then(r => setSignals(r.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [strategyId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-1 border border-white/8 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h3 className="font-semibold text-foreground">📡 Signal History</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10 animate-pulse">Loading signals…</p>
          ) : signals.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-3xl mb-2">📭</p>
              <p className="text-sm text-muted-foreground">No signals received yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Publish the strategy and send a TradingView alert to see signals here.</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground text-left border-b border-white/6">
                  <th className="pb-2 pr-3">Time</th>
                  <th className="pb-2 pr-3">Action</th>
                  <th className="pb-2 pr-3">Ticker</th>
                  <th className="pb-2 pr-3">Contracts</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Latency</th>
                </tr>
              </thead>
              <tbody>
                {signals.map(s => (
                  <tr key={s.id} className="border-b border-white/4 hover:bg-white/2">
                    <td className="py-2 pr-3 text-muted-foreground font-mono">
                      {new Date(s.received_at).toLocaleTimeString()}
                    </td>
                    <td className={`py-2 pr-3 font-bold ${s.action === "buy" ? "text-emerald-400" : "text-rose-400"}`}>
                      {s.action.toUpperCase()}
                    </td>
                    <td className="py-2 pr-3 font-mono text-foreground">{s.ticker}</td>
                    <td className="py-2 pr-3 font-mono text-foreground">{s.contracts || "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`font-mono ${SIGNAL_STATUS_COLOR[s.status] || "text-foreground"}`}>
                        {s.is_test ? "🧪 " : ""}{s.status}
                      </span>
                      {s.error && <p className="text-rose-400 text-xs mt-0.5 truncate max-w-[200px]" title={s.error}>{s.error}</p>}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {s.processing_duration_ms ? `${s.processing_duration_ms}ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pine version history panel ───────────────────────────────────────────────

function PineVersionPanel({ strategyId, onClose }: { strategyId: string; onClose: () => void }) {
  const [versions, setVersions] = useState<PineVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PineVersion | null>(null);

  useEffect(() => {
    api.get<{ data: PineVersion[] }>(`/strategy/${strategyId}/pine`)
      .then(r => { setVersions(r.data.data); setSelected(r.data.data[0] || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [strategyId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-1 border border-white/8 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/8">
          <h3 className="font-semibold text-foreground">🌲 Pine Script Versions</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-32 border-r border-white/8 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-muted-foreground p-3 animate-pulse">Loading…</p>
            ) : versions.map(v => (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`w-full text-left p-3 text-xs border-b border-white/4 transition-colors ${
                  selected?.id === v.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <p className="font-bold">v{v.version_number}</p>
                <p className="text-[10px] mt-0.5 opacity-70">{new Date(v.created_at).toLocaleDateString()}</p>
              </button>
            ))}
          </div>
          {/* Code view */}
          <div className="flex-1 overflow-y-auto p-4">
            {selected ? (
              <pre className="text-xs font-mono text-cyan-300 whitespace-pre-wrap leading-5">
                {selected.pine_code}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground text-center pt-10">No versions saved yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Webhook Strategy Card ────────────────────────────────────────────────────

function WebhookStrategyCard({
  strategy,
  onRefresh,
  onViewSignals,
  onViewVersions,
}: {
  strategy: WebhookStrategy;
  onRefresh: () => void;
  onViewSignals: (id: string) => void;
  onViewVersions: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [showPineEditor, setShowPineEditor] = useState(false);
  const [pineCode, setPineCode] = useState(strategy.pine_code || "");
  const pineRef = useRef<HTMLTextAreaElement>(null);

  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const handlePublish = () => action(async () => {
    const r = await api.post<{ data: { secret: string; webhook_url: string } }>(
      `/strategy/${strategy.id}/publish`
    );
    setSecret(r.data.data.secret);
    setWebhookUrl(r.data.data.webhook_url);
    await onRefresh();
  });

  const handlePause  = () => action(async () => { await api.post(`/strategy/${strategy.id}/pause`);  onRefresh(); });
  const handleResume = () => action(async () => { await api.post(`/strategy/${strategy.id}/resume`); onRefresh(); });
  const handleStop   = () => action(async () => {
    if (!confirm("Stop this strategy? It will no longer accept signals.")) return;
    await api.post(`/strategy/${strategy.id}/stop`); onRefresh();
  });
  const handleRotate = () => action(async () => {
    if (!confirm("Rotate the webhook secret? The old secret stays valid for 5 minutes.")) return;
    const r = await api.post<{ data: { secret: string; webhook_url: string } }>(
      `/strategy/${strategy.id}/rotate-secret`
    );
    setSecret(r.data.data.secret);
    setWebhookUrl(r.data.data.webhook_url);
  });
  const handleTestMode = () => action(async () => {
    await api.patch(`/strategy/${strategy.id}/test-mode?enabled=${!strategy.is_test_mode}`);
    onRefresh();
  });
  const handleSavePine = () => action(async () => {
    if (!pineCode.trim()) return;
    await api.post(`/strategy/${strategy.id}/pine`, { pine_code: pineCode });
    setShowPineEditor(false);
    onRefresh();
  });

  const wurl = strategy.webhook_url || `https://algofin-api.onrender.com/api/v1/webhooks/tv/${strategy.id}`;

  return (
    <>
      <div className="bg-surface-1 border border-white/8 rounded-2xl overflow-hidden hover:border-white/12 transition-all group">
        {/* Status bar */}
        <div className={`h-0.5 ${STATUS_DOT[strategy.status]} w-full`} />

        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground truncate">{strategy.name}</h3>
                <Badge label={strategy.status} style={STATUS_PILL[strategy.status] || ""} />
                <Badge label="TradingView" style="bg-blue-500/10 text-blue-400 border-blue-500/20" />
                {strategy.is_test_mode && (
                  <Badge label="🧪 Test Mode" style="bg-amber-500/10 text-amber-400 border-amber-500/20" />
                )}
              </div>
              {strategy.description && (
                <p className="text-xs text-muted-foreground mt-1">{strategy.description}</p>
              )}
            </div>
            <div className="text-right text-xs text-muted-foreground flex-shrink-0">
              <p>v{strategy.current_version}</p>
              <p className="mt-0.5">{new Date(strategy.created_at).toLocaleDateString()}</p>
            </div>
          </div>

          {/* Params grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Symbol</p>
              <p className="font-mono text-foreground font-medium">{strategy.symbol}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Timeframe</p>
              <p className="font-mono text-foreground">{strategy.timeframe || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Qty Default</p>
              <p className="font-mono text-foreground">{strategy.quantity || "From signal"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Signals</p>
              <p className="text-foreground">{strategy.execution_count}</p>
            </div>
          </div>

          {/* Webhook URL (only show when active or beyond) */}
          {strategy.status !== "draft" && strategy.status !== "archived" && (
            <div className="bg-background border border-white/6 rounded-xl p-3 space-y-1.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Webhook URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-primary truncate">{wurl}</code>
                <CopyButton text={wurl} />
              </div>
            </div>
          )}

          {/* Actions row */}
          <div className="flex items-center gap-2 pt-1 border-t border-white/6 flex-wrap">
            {/* Lifecycle buttons */}
            {strategy.status === "draft" && (
              <button onClick={handlePublish} disabled={busy}
                className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-semibold
                  hover:bg-emerald-600 transition-all disabled:opacity-50 active:scale-95">
                {busy ? "Publishing…" : "🚀 Publish"}
              </button>
            )}
            {strategy.status === "active" && (
              <>
                <button onClick={handlePause} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-amber-500/30 text-amber-400
                    hover:bg-amber-500/10 transition-colors disabled:opacity-50">
                  ⏸ Pause
                </button>
                <button onClick={handleStop} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400
                    hover:bg-red-500/10 transition-colors disabled:opacity-50">
                  ⏹ Stop
                </button>
                <button onClick={handleRotate} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/8 text-muted-foreground
                    hover:text-foreground transition-colors disabled:opacity-50">
                  🔄 Rotate Secret
                </button>
              </>
            )}
            {strategy.status === "paused" && (
              <>
                <button onClick={handleResume} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20
                    hover:bg-emerald-500/20 transition-colors disabled:opacity-50">
                  ▶ Resume
                </button>
                <button onClick={handleStop} disabled={busy}
                  className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400
                    hover:bg-red-500/10 transition-colors disabled:opacity-50">
                  ⏹ Stop
                </button>
              </>
            )}

            {/* Utilities */}
            {strategy.status !== "archived" && (
              <>
                <button onClick={handleTestMode} disabled={busy}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    strategy.is_test_mode
                      ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                      : "border-white/8 text-muted-foreground hover:text-foreground"
                  }`}>
                  {strategy.is_test_mode ? "🧪 Test ON" : "Test Mode"}
                </button>
                <button onClick={() => setShowPineEditor(v => !v)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-white/8 text-muted-foreground
                    hover:text-foreground transition-colors">
                  🌲 Pine
                </button>
              </>
            )}

            {/* History buttons */}
            <div className="ml-auto flex gap-2">
              <button onClick={() => onViewVersions(strategy.id)}
                className="text-xs px-3 py-1.5 rounded-lg border border-white/8 text-muted-foreground hover:text-foreground transition-colors">
                History
              </button>
              <button onClick={() => onViewSignals(strategy.id)}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20
                  hover:bg-primary/20 transition-colors">
                📡 Signals
              </button>
            </div>
          </div>

          {/* Pine Script editor */}
          {showPineEditor && strategy.status !== "archived" && (
            <div className="space-y-3 border-t border-white/6 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Pine Script v5</p>
                <p className="text-xs text-muted-foreground">Version {strategy.current_version} → {strategy.current_version + 1}</p>
              </div>
              <textarea
                ref={pineRef}
                value={pineCode}
                onChange={e => setPineCode(e.target.value)}
                rows={10}
                spellCheck={false}
                placeholder={`//@version=5\nstrategy("My Strategy", overlay=true)\n\n// Your Pine Script here`}
                className="w-full bg-background border border-white/8 rounded-xl p-4 text-xs font-mono
                  text-cyan-300 resize-y focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20
                  placeholder:text-muted-foreground/40 leading-5"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowPineEditor(false)}
                  className="text-xs px-4 py-2 rounded-lg border border-white/8 text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button onClick={handleSavePine} disabled={busy || !pineCode.trim()}
                  className="text-xs px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold
                    hover:bg-primary/90 transition-all disabled:opacity-50 active:scale-95">
                  {busy ? "Saving…" : "Save Version"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Secret reveal modal */}
      {secret && webhookUrl && (
        <SecretModal
          secret={secret}
          webhookUrl={webhookUrl}
          onClose={() => setSecret(null)}
        />
      )}
    </>
  );
}

// ── Create Webhook Strategy Form ─────────────────────────────────────────────

function CreateWebhookForm({
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
    exchange_account_id: accounts[0]?.id || "",
    symbol: "BTCUSDT",
    timeframe: "1h",
    quantity: "",
    reduce_only: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.exchange_account_id) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/strategy/pine", {
        name: form.name.trim(),
        description: form.description.trim() || null,
        exchange_account_id: form.exchange_account_id,
        symbol: form.symbol.trim().toUpperCase(),
        timeframe: form.timeframe.trim() || null,
        quantity: form.quantity ? parseFloat(form.quantity) : null,
        reduce_only: form.reduce_only,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create strategy");
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "w-full bg-background border border-white/8 rounded-xl px-4 py-2.5 text-sm text-foreground \
    focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/40";

  return (
    <form onSubmit={handleSubmit} className="bg-surface-1 border border-primary/20 rounded-2xl p-6 space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <span className="text-primary">⚡</span> New TradingView Strategy
      </h3>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Strategy Name *</label>
          <input value={form.name} onChange={e => set("name", e.target.value)}
            placeholder="My BTCUSDT Strategy" required className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Exchange Account *</label>
          <select value={form.exchange_account_id} onChange={e => set("exchange_account_id", e.target.value)}
            className={inputClass + " cursor-pointer"}>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.label} ({a.exchange})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Symbol</label>
          <input value={form.symbol} onChange={e => set("symbol", e.target.value.toUpperCase())}
            placeholder="BTCUSDT" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Timeframe (optional)</label>
          <select value={form.timeframe} onChange={e => set("timeframe", e.target.value)} className={inputClass + " cursor-pointer"}>
            {["", "1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W"].map(t => (
              <option key={t} value={t}>{t || "Not set"}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Default Quantity (contracts, optional)</label>
          <input type="number" step="any" min="0" value={form.quantity}
            onChange={e => set("quantity", e.target.value)}
            placeholder="From signal if blank" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Description (optional)</label>
          <input value={form.description} onChange={e => set("description", e.target.value)}
            placeholder="What this strategy does" className={inputClass} />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm text-foreground">
        <input type="checkbox" checked={form.reduce_only} onChange={e => set("reduce_only", e.target.checked)}
          className="rounded" />
        Reduce-only (close positions only)
      </label>

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300">
        ℹ️ Strategy starts in <strong>DRAFT</strong> state. After creation, click <strong>Publish</strong> to generate
        your webhook secret and activate signal reception.
      </div>

      <div className="flex gap-3 justify-end pt-2">
        <button type="button" onClick={onCancel}
          className="px-5 py-2.5 rounded-xl border border-white/8 text-muted-foreground hover:text-foreground transition-colors text-sm">
          Cancel
        </button>
        <button type="submit" disabled={busy}
          className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90
            transition-all active:scale-[0.98] disabled:opacity-50 text-sm">
          {busy ? "Creating…" : "Create Strategy"}
        </button>
      </div>
    </form>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function WebhookStrategyPage() {
  const [strategies, setStrategies]   = useState<WebhookStrategy[]>([]);
  const [accounts, setAccounts]       = useState<ExchangeAccount[]>([]);
  const [showCreate, setShowCreate]   = useState(false);
  const [signalsFor, setSignalsFor]   = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [filter, setFilter]           = useState("all");
  const [loading, setLoading]         = useState(true);
  const showSkeleton                  = useDelayedLoading(loading);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [strat, accts] = await Promise.all([
        api.get<{ data: WebhookStrategy[] }>("/strategy?strategy_type=pine_webhook"),
        api.get<{ data: ExchangeAccount[] }>("/exchanges"),
      ]);
      setStrategies((strat.data.data || []).filter(s => s.strategy_type === "pine_webhook"));
      setAccounts(accts.data.data || []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  const counts = {
    all:      strategies.length,
    draft:    strategies.filter(s => s.status === "draft").length,
    active:   strategies.filter(s => s.status === "active").length,
    paused:   strategies.filter(s => s.status === "paused").length,
    stopped:  strategies.filter(s => s.status === "stopped").length,
  };

  const filtered = filter === "all" ? strategies : strategies.filter(s => s.status === filter);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚡</span>
            <h1 className="text-2xl font-bold text-foreground">Webhook Strategies</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 ml-10">
            Receive signals from TradingView Pine Script alerts and auto-execute orders on Binance.
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
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Total",   value: counts.all,     color: "text-foreground" },
          { label: "Draft",   value: counts.draft,   color: "text-slate-400" },
          { label: "Active",  value: counts.active,  color: "text-emerald-400" },
          { label: "Paused",  value: counts.paused,  color: "text-amber-400" },
          { label: "Stopped", value: counts.stopped, color: "text-slate-400" },
        ].map(s => (
          <div key={s.label} className="bg-surface-1 border border-white/8 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* How it works banner */}
      {strategies.length === 0 && !loading && !showCreate && (
        <div className="bg-surface-1 border border-primary/15 rounded-2xl p-6 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            🗺️ How it works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            {[
              { step: "1", title: "Create", desc: "Add a new strategy with your symbol and exchange account." },
              { step: "2", title: "Publish", desc: "Activate it to get your unique webhook URL and secret." },
              { step: "3", title: "Configure TradingView", desc: "Add the URL to your Pine Script alert with the secret in the message body." },
              { step: "4", title: "Auto-Execute", desc: "Every alert fires a signal → risk check → Binance order, all within ~200ms." },
            ].map(s => (
              <div key={s.step} className="bg-background border border-white/6 rounded-xl p-4">
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-sm font-bold flex items-center justify-center mb-3">
                  {s.step}
                </div>
                <p className="font-semibold text-foreground">{s.title}</p>
                <p className="text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <CreateWebhookForm
          accounts={accounts}
          onCreated={() => { setShowCreate(false); loadAll(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Filter tabs */}
      {strategies.length > 0 && (
        <div className="flex gap-1 p-1 bg-surface-1 rounded-xl border border-white/8 w-fit">
          {["all", "draft", "active", "paused", "stopped"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {showSkeleton && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="skeleton rounded-2xl p-5 h-36" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && !showCreate && (
        <div className="bg-surface-1 border border-white/8 rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">📡</p>
          <p className="text-foreground font-medium">
            {filter === "all" ? "No webhook strategies yet" : `No ${filter} strategies`}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {filter === "all" && "Create your first strategy to start receiving TradingView signals."}
          </p>
          {filter === "all" && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold
                hover:bg-primary/90 transition-all active:scale-[0.98]"
            >
              + Create First Strategy
            </button>
          )}
        </div>
      )}

      {/* Strategy cards */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(s => (
            <WebhookStrategyCard
              key={s.id}
              strategy={s}
              onRefresh={loadAll}
              onViewSignals={setSignalsFor}
              onViewVersions={setVersionsFor}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {signalsFor && (
        <SignalHistoryPanel strategyId={signalsFor} onClose={() => setSignalsFor(null)} />
      )}
      {versionsFor && (
        <PineVersionPanel strategyId={versionsFor} onClose={() => setVersionsFor(null)} />
      )}
    </div>
  );
}
