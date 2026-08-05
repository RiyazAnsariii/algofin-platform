"use client";
// src/app/(app)/admin/influencer/page.tsx
// Phase INF — Admin: Strategy Management Panel

import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";

interface Strategy {
  id: string;
  strategy_code: string;
  name: string;
  creator_name: string;
  status: string;
  risk_level: string;
  version: string;
  pine_code: string | null;
  webhook_url: string | null;
  win_rate: string | null;
  backtested_return: string | null;
  max_drawdown: string | null;
  total_trades: number | null;
  supported_markets: string[];
  recommended_timeframe: string | null;
  description: string | null;
  subscriber_count?: number;
}

interface Signal {
  id: string;
  action: string;
  ticker: string;
  is_test: boolean;
  execution_mode: string;
  status: string;
  subscriber_count: number;
  received_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active:   "#10b981",
  draft:    "#f59e0b",
  archived: "#64748b",
};

export default function AdminInfluencerPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "signals" | "subscribers" | "test">("overview");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSecretModal, setShowSecretModal] = useState<{ id: string; secret: string; url: string } | null>(null);

  const load = () => {
    setLoading(true);
    api.get("/influencer/admin/strategies")
      .then((r) => {
        const data = r.data.data ?? [];
        setStrategies(data);
        if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const selected = strategies.find((s) => s.id === selectedId) ?? null;

  const handleArchive = async (id: string) => {
    if (!confirm("Archive this strategy? It will be hidden from the marketplace.")) return;
    try {
      await api.post(`/influencer/admin/strategies/${id}/archive`);
      load();
    } catch { }
  };

  const handleRotateSecret = async (id: string) => {
    if (!confirm("Rotate webhook secret? The old secret is immediately invalidated.")) return;
    try {
      const r = await api.post(`/influencer/admin/strategies/${id}/rotate-secret`);
      const d = r.data.data;
      setShowSecretModal({ id, secret: d.plain_secret, url: d.webhook_url });
    } catch { }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await api.patch(`/influencer/admin/strategies/${id}`, { status });
      load();
    } catch { }
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "24px", maxWidth: 1300, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>Strategy Management</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Create, manage, and monitor influencer strategies.
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} style={{
          padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
          color: "#fff", border: "none", cursor: "pointer",
        }}>+ New Strategy</button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#64748b" }}>Loading strategies…</div>
      ) : (
        <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>
          {/* Left: strategy list */}
          <div style={{ width: 260, flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Strategies ({strategies.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {strategies.map((s) => (
                <button key={s.id} onClick={() => setSelectedId(s.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: 10, cursor: "pointer", textAlign: "left",
                  background: selectedId === s.id ? "rgba(6,182,212,0.1)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${selectedId === s.id ? "rgba(6,182,212,0.3)" : "rgba(255,255,255,0.06)"}`,
                  transition: "all 0.15s",
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: STATUS_COLORS[s.status] ?? "#64748b",
                    boxShadow: s.status === "active" ? `0 0 6px ${STATUS_COLORS[s.status]}` : undefined,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.strategy_code}</div>
                  </div>
                </button>
              ))}

              {strategies.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#475569", fontSize: 13 }}>
                  No strategies yet.
                </div>
              )}
            </div>
          </div>

          {/* Right: detail panel */}
          {selected ? (
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Strategy header */}
              <div style={{
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, padding: "20px 24px",
                display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 17, fontWeight: 700, color: "#e2e8f0" }}>{selected.name}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, fontFamily: "monospace", background: "rgba(255,255,255,0.05)", color: "#64748b" }}>
                      {selected.strategy_code}
                    </span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: `${STATUS_COLORS[selected.status]}15`, color: STATUS_COLORS[selected.status], border: `1px solid ${STATUS_COLORS[selected.status]}30` }}>
                      {selected.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    by {selected.creator_name} · v{selected.version}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selected.status === "draft" && (
                    <button onClick={() => handleStatusChange(selected.id, "active")} style={actionBtn("#10b981")}>Publish</button>
                  )}
                  {selected.status === "active" && (
                    <button onClick={() => handleStatusChange(selected.id, "draft")} style={actionBtn("#f59e0b")}>Unpublish</button>
                  )}
                  <button onClick={() => handleRotateSecret(selected.id)} style={actionBtn("#06b6d4")}>Rotate Secret</button>
                  {selected.status !== "archived" && (
                    <button onClick={() => handleArchive(selected.id)} style={actionBtn("#ef4444")}>Archive</button>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.07)", paddingBottom: 1 }}>
                {(["overview", "signals", "subscribers", "test"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: "8px 16px", borderRadius: "8px 8px 0 0", fontSize: 13,
                    background: "none", border: "none", cursor: "pointer",
                    color: tab === t ? "#06b6d4" : "#64748b",
                    borderBottom: `2px solid ${tab === t ? "#06b6d4" : "transparent"}`,
                    fontWeight: tab === t ? 600 : 400, transition: "all 0.15s",
                  }}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflow: "auto" }}>
                {tab === "overview" && <OverviewTab strategy={selected} onChange={load} />}
                {tab === "signals" && <SignalsTab strategyId={selected.id} />}
                {tab === "subscribers" && <SubscribersTab strategyId={selected.id} />}
                {tab === "test" && <TestSignalTab strategyId={selected.id} strategyName={selected.name} />}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 14 }}>
              Select a strategy to view details
            </div>
          )}
        </div>
      )}

      {showCreateModal && (
        <CreateStrategyModal onClose={() => setShowCreateModal(false)} onCreated={(secret, url) => {
          setShowCreateModal(false);
          load();
          setShowSecretModal({ id: "", secret, url });
        }} />
      )}

      {showSecretModal && (
        <SecretDisplayModal
          secret={showSecretModal.secret}
          url={showSecretModal.url}
          onClose={() => setShowSecretModal(null)}
        />
      )}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ strategy, onChange }: { strategy: Strategy; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: strategy.name,
    description: strategy.description ?? "",
    backtested_return: strategy.backtested_return ?? "",
    max_drawdown: strategy.max_drawdown ?? "",
    win_rate: strategy.win_rate ?? "",
    total_trades: strategy.total_trades?.toString() ?? "",
    recommended_timeframe: strategy.recommended_timeframe ?? "",
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/influencer/admin/strategies/${strategy.id}`, {
        name: form.name,
        description: form.description || null,
        backtested_return: form.backtested_return ? parseFloat(form.backtested_return) : null,
        max_drawdown: form.max_drawdown ? parseFloat(form.max_drawdown) : null,
        win_rate: form.win_rate ? parseFloat(form.win_rate) : null,
        total_trades: form.total_trades ? parseInt(form.total_trades) : null,
        recommended_timeframe: form.recommended_timeframe || null,
      });
      setEditing(false);
      onChange();
    } catch { } finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Metrics grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
          {[
            { label: "Win Rate", value: strategy.win_rate ? `${parseFloat(strategy.win_rate).toFixed(1)}%` : "—", color: "#10b981" },
            { label: "Backtested Return", value: strategy.backtested_return ? `+${parseFloat(strategy.backtested_return).toFixed(1)}%` : "—", color: "#06b6d4" },
            { label: "Max Drawdown", value: strategy.max_drawdown ? `-${parseFloat(strategy.max_drawdown).toFixed(1)}%` : "—", color: "#f59e0b" },
            { label: "Total Trades", value: strategy.total_trades?.toLocaleString() ?? "—", color: "#8b5cf6" },
          ].map((m) => (
            <div key={m.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "14px 18px" }}>
              <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Webhook URL */}
        {strategy.webhook_url && (
          <div style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", borderRadius: 12, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Webhook URL (add to TradingView alert)</div>
            <code style={{ fontSize: 12, color: "#06b6d4", wordBreak: "break-all" }}>{strategy.webhook_url}</code>
          </div>
        )}

        {/* Markets */}
        {strategy.supported_markets?.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Supported Markets</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {strategy.supported_markets.map((m) => (
                <span key={m} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, background: "rgba(6,182,212,0.08)", color: "#06b6d4", border: "1px solid rgba(6,182,212,0.15)" }}>{m}</span>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => setEditing(true)} style={{ alignSelf: "flex-start", padding: "8px 16px", borderRadius: 8, fontSize: 13, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", cursor: "pointer" }}>
          Edit Metadata
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 500 }}>
      {[
        { key: "name", label: "Name" },
        { key: "description", label: "Description" },
        { key: "win_rate", label: "Win Rate (%)" },
        { key: "backtested_return", label: "Backtested Return (%)" },
        { key: "max_drawdown", label: "Max Drawdown (%)" },
        { key: "total_trades", label: "Total Trades" },
        { key: "recommended_timeframe", label: "Timeframe (e.g. 1h)" },
      ].map(({ key, label }) => (
        <div key={key}>
          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>{label}</label>
          <input value={(form as any)[key]} onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
        </div>
      ))}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => setEditing(false)} style={{ padding: "9px 18px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ padding: "9px 18px", borderRadius: 8, background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </div>
  );
}

// ── Signals Tab ───────────────────────────────────────────────────────────────
function SignalsTab({ strategyId }: { strategyId: string }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/influencer/admin/strategies/${strategyId}/signals?limit=50`)
      .then((r) => setSignals(r.data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [strategyId]);

  if (loading) return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading signals…</div>;

  if (signals.length === 0) return (
    <div style={{ padding: "60px", textAlign: "center", color: "#475569" }}>
      No signals received yet. Use the Test tab to send a DRY_RUN signal.
    </div>
  );

  const ACTION_COLORS: Record<string, string> = { ENTER_LONG: "#10b981", EXIT_LONG: "#64748b", ENTER_SHORT: "#ef4444", EXIT_SHORT: "#64748b" };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["Time", "Action", "Ticker", "Mode", "Status", "Subscribers"].map((h) => (
              <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#475569", textAlign: "left", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signals.map((sig) => (
            <tr key={sig.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{new Date(sig.received_at).toLocaleString()}</td>
              <td style={{ padding: "9px 14px" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: ACTION_COLORS[sig.action] ?? "#94a3b8" }}>{sig.action.replace("_", " ")}</span>
              </td>
              <td style={{ padding: "9px 14px", fontSize: 13, color: "#e2e8f0", fontWeight: 500 }}>{sig.ticker}</td>
              <td style={{ padding: "9px 14px" }}>
                <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: sig.execution_mode === "DRY_RUN" ? "rgba(139,92,246,0.12)" : "rgba(6,182,212,0.12)", color: sig.execution_mode === "DRY_RUN" ? "#8b5cf6" : "#06b6d4" }}>
                  {sig.is_test ? "TEST" : sig.execution_mode}
                </span>
              </td>
              <td style={{ padding: "9px 14px", fontSize: 12, color: sig.status === "COMPLETED" ? "#10b981" : "#f59e0b" }}>{sig.status}</td>
              <td style={{ padding: "9px 14px", fontSize: 13, color: "#94a3b8" }}>{sig.subscriber_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Subscribers Tab ────────────────────────────────────────────────────────────
function SubscribersTab({ strategyId }: { strategyId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/influencer/admin/strategies/${strategyId}/subscribers`)
      .then((r) => setRows(r.data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [strategyId]);

  if (loading) return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading subscribers…</div>;
  if (rows.length === 0) return <div style={{ padding: "60px", textAlign: "center", color: "#475569" }}>No subscribers yet.</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["User", "Symbol", "Capital", "Leverage", "Status", "Since"].map((h) => (
              <th key={h} style={{ padding: "10px 14px", fontSize: 11, color: "#475569", textAlign: "left", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.subscription_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <td style={{ padding: "9px 14px", fontSize: 13, color: "#e2e8f0" }}>{r.user_email ?? r.user_id.slice(0, 8) + "…"}</td>
              <td style={{ padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#06b6d4" }}>{r.symbol}</td>
              <td style={{ padding: "9px 14px", fontSize: 13, color: "#94a3b8" }}>${parseFloat(r.capital_usdt).toLocaleString()}</td>
              <td style={{ padding: "9px 14px", fontSize: 13, color: "#94a3b8" }}>{r.leverage}×</td>
              <td style={{ padding: "9px 14px" }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: r.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(100,116,139,0.1)", color: r.status === "active" ? "#10b981" : "#64748b", fontWeight: 600 }}>{r.status}</span>
              </td>
              <td style={{ padding: "9px 14px", fontSize: 12, color: "#64748b" }}>{new Date(r.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Test Signal Tab ───────────────────────────────────────────────────────────
function TestSignalTab({ strategyId, strategyName }: { strategyId: string; strategyName: string }) {
  const [form, setForm] = useState({ action: "ENTER_LONG", ticker: "BTCUSDT", price: "" });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setSending(true);
    setResult(null);
    setError(null);
    try {
      const r = await api.post("/influencer/admin/test-signal", {
        influencer_strategy_id: strategyId,
        action: form.action,
        ticker: form.ticker.toUpperCase(),
        price: form.price ? parseFloat(form.price) : undefined,
      });
      setResult(r.data.data);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Failed to send test signal");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ maxWidth: 440 }}>
      <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#8b5cf6" }}>
        Test signals are always <strong>DRY_RUN</strong>. No real orders are placed.
        Each click generates a fresh signal_id — click as many times as needed.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Action</label>
          <select value={form.action} onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
            style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }}>
            {["ENTER_LONG", "EXIT_LONG", "ENTER_SHORT", "EXIT_SHORT"].map((a) => (
              <option key={a} value={a} style={{ background: "#1a1f2e" }}>{a.replace("_", " ")}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Ticker / Symbol</label>
          <input value={form.ticker} onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
        </div>

        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Price (optional — for ENTER signals)</label>
          <input type="number" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            placeholder="e.g. 64000"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
        </div>

        <button onClick={send} disabled={sending || !form.ticker} style={{
          padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: "linear-gradient(135deg,#8b5cf6,#06b6d4)",
          color: "#fff", border: "none", cursor: sending ? "wait" : "pointer", opacity: sending ? 0.7 : 1,
        }}>{sending ? "Sending…" : "Send Test Signal"}</button>

        {result && (
          <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ color: "#10b981", fontWeight: 600, marginBottom: 8 }}>Signal Queued!</div>
            <div style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>
              signal_id: {result.signal_id}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{result.message}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
              Check the <strong style={{ color: "#94a3b8" }}>Signals tab</strong> to see fan-out results.
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "12px 16px", color: "#ef4444", fontSize: 13 }}>{error}</div>
        )}
      </div>
    </div>
  );
}

// ── Create Strategy Modal ─────────────────────────────────────────────────────
function CreateStrategyModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (secret: string, url: string) => void;
}) {
  const [form, setForm] = useState({
    strategy_code: "",
    name: "",
    creator_name: "",
    description: "",
    risk_level: "medium",
    supported_markets: "",
    recommended_timeframe: "",
    plain_secret: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const genSecret = () => {
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const secret = btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, "").slice(0, 32);
    setForm((f) => ({ ...f, plain_secret: secret }));
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await api.post("/influencer/admin/strategies", {
        strategy_code: form.strategy_code.toUpperCase(),
        name: form.name,
        creator_name: form.creator_name,
        description: form.description || null,
        risk_level: form.risk_level,
        supported_markets: form.supported_markets.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
        recommended_timeframe: form.recommended_timeframe || null,
        plain_secret: form.plain_secret,
      });
      const d = r.data.data;
      onCreated(d.plain_secret, d.webhook_url);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Failed to create strategy");
    } finally {
      setSubmitting(false); }
  };

  const fields: Array<{ key: string; label: string; type?: string; placeholder?: string }> = [
    { key: "strategy_code", label: "Strategy Code (e.g. INF_001)", placeholder: "INF_001" },
    { key: "name", label: "Strategy Name", placeholder: "EMA Momentum Pro" },
    { key: "creator_name", label: "Creator Name" },
    { key: "description", label: "Description (optional)" },
    { key: "supported_markets", label: "Supported Markets (comma-separated)", placeholder: "BTCUSDT, ETHUSDT" },
    { key: "recommended_timeframe", label: "Timeframe (e.g. 1h, 4h)", placeholder: "1h" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0f1117", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: 32, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>Create New Strategy</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {fields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>{label}</label>
              <input value={(form as any)[key]} placeholder={placeholder}
                onChange={(e) => setForm((f: any) => ({ ...f, [key]: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
            </div>
          ))}

          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Risk Level</label>
            <select value={form.risk_level} onChange={(e) => setForm((f) => ({ ...f, risk_level: e.target.value }))}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }}>
              {["low", "medium", "high"].map((r) => <option key={r} value={r} style={{ background: "#1a1f2e" }}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Webhook Secret (min 16 chars)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={form.plain_secret} onChange={(e) => setForm((f) => ({ ...f, plain_secret: e.target.value }))}
                placeholder="Paste or generate..."
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none", fontFamily: "monospace" }} />
              <button onClick={genSecret} style={{ padding: "9px 14px", borderRadius: 8, background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)", color: "#06b6d4", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>Generate</button>
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 5 }}>
              This secret is shown once after creation. Store it before closing.
            </div>
          </div>
        </div>

        {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 14, padding: "8px 12px", background: "rgba(239,68,68,0.07)", borderRadius: 8 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>Cancel</button>
          <button onClick={submit} disabled={submitting || !form.name || !form.strategy_code || form.plain_secret.length < 16}
            style={{ flex: 2, padding: "10px", borderRadius: 10, background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? "Creating…" : "Create Strategy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Secret Display Modal ──────────────────────────────────────────────────────
function SecretDisplayModal({ secret, url, onClose }: { secret: string; url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 24 }}>
      <div style={{ background: "#0f1117", border: "2px solid rgba(239,68,68,0.4)", borderRadius: 20, padding: 32, width: "100%", maxWidth: 520 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>⚠ Store this secret immediately</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>This is shown only once and cannot be retrieved again.</div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Webhook Secret</div>
          <div style={{ display: "flex", gap: 8 }}>
            <code style={{ flex: 1, padding: "10px 12px", borderRadius: 8, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 13, wordBreak: "break-all", fontFamily: "monospace" }}>{secret}</code>
            <button onClick={() => copy(secret)} style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>Webhook URL (add to TradingView alert)</div>
          <code style={{ display: "block", padding: "10px 12px", borderRadius: 8, background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", color: "#06b6d4", fontSize: 12, wordBreak: "break-all", fontFamily: "monospace" }}>{url}</code>
        </div>

        <div style={{ fontSize: 12, color: "#475569", marginBottom: 16, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
          Add to TradingView Pine alert message:
          <br /><code style={{ color: "#94a3b8" }}>{`{"secret": "${secret.slice(0, 6)}...", "action": "ENTER_LONG", "ticker": "{{ticker}}"}`}</code>
        </div>

        <button onClick={onClose} style={{ width: "100%", padding: "11px", borderRadius: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
          I have saved the secret — Close
        </button>
      </div>
    </div>
  );
}

function actionBtn(color: string) {
  return {
    padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
    background: `${color}12`, border: `1px solid ${color}30`, color,
    transition: "all 0.15s", fontWeight: 500,
  } as React.CSSProperties;
}
