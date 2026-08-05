"use client";
// src/app/(app)/influencer/my-strategies/page.tsx
// Phase INF — My Subscriptions + Execution History

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

interface Subscription {
  id: string;
  influencer_strategy_id: string;
  exchange_account_id: string;
  symbol: string;
  capital_usdt: string;
  leverage: number;
  status: "active" | "paused" | "stopped";
  strategy_name: string | null;
  strategy_code: string | null;
  created_at: string;
  updated_at: string;
}

interface Execution {
  id: string;
  signal_id: string;
  action: string;
  symbol: string;
  execution_mode: string;
  computed_quantity: string | null;
  risk_result: string | null;
  status: string;
  error: string | null;
  execution_latency_ms: number | null;
  created_at: string;
}

const STATUS_CONFIG = {
  active:  { label: "Active",  color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  paused:  { label: "Paused",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  stopped: { label: "Stopped", color: "#64748b", bg: "rgba(100,116,139,0.1)" },
};

const ACTION_CONFIG: Record<string, { color: string; label: string }> = {
  ENTER_LONG:  { color: "#10b981", label: "LONG" },
  EXIT_LONG:   { color: "#64748b", label: "EXIT L" },
  ENTER_SHORT: { color: "#ef4444", label: "SHORT" },
  EXIT_SHORT:  { color: "#64748b", label: "EXIT S" },
};

const EXEC_STATUS_CONFIG: Record<string, { color: string }> = {
  DRY_RUN_OK:         { color: "#10b981" },
  ORDER_SUBMITTED:    { color: "#06b6d4" },
  RISK_BLOCKED:       { color: "#f59e0b" },
  QUANTITY_TOO_SMALL: { color: "#f59e0b" },
  BELOW_MIN_NOTIONAL: { color: "#f59e0b" },
  PRICE_UNAVAILABLE:  { color: "#64748b" },
  FAILED:             { color: "#ef4444" },
};

function SubscriptionCard({ sub, onAction }: {
  sub: Subscription;
  onAction: (id: string, action: "pause" | "resume" | "stop") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loadingExec, setLoadingExec] = useState(false);

  const cfg = STATUS_CONFIG[sub.status];

  const loadExecutions = async () => {
    if (executions.length > 0 || loadingExec) { setExpanded(!expanded); return; }
    setExpanded(true);
    setLoadingExec(true);
    try {
      const r = await api.get(`/influencer/subscriptions/${sub.id}/executions?limit=20`);
      setExecutions(r.data.data ?? []);
    } catch { setExecutions([]); }
    finally { setLoadingExec(false); }
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      {/* Card header */}
      <div style={{ padding: "18px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: "linear-gradient(135deg,rgba(6,182,212,0.15),rgba(139,92,246,0.15))",
              border: "1px solid rgba(6,182,212,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18,
            }}>⚡</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e2e8f0" }}>
                {sub.strategy_name ?? "Strategy"}
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {sub.symbol}
                <span style={{ margin: "0 6px", color: "#374151" }}>·</span>
                ${parseFloat(sub.capital_usdt).toLocaleString()} USDT
                <span style={{ margin: "0 6px", color: "#374151" }}>·</span>
                {sub.leverage}× leverage
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
              color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}30`,
            }}>{cfg.label}</span>

            {/* Actions */}
            {sub.status === "active" && (
              <button onClick={() => onAction(sub.id, "pause")} style={btnStyle("#f59e0b")}>Pause</button>
            )}
            {sub.status === "paused" && (
              <button onClick={() => onAction(sub.id, "resume")} style={btnStyle("#10b981")}>Resume</button>
            )}
            {sub.status !== "stopped" && (
              <button onClick={() => onAction(sub.id, "stop")} style={btnStyle("#ef4444")}>Stop</button>
            )}

            <button onClick={loadExecutions} style={{
              padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "#64748b", transition: "all 0.15s",
            }}>{expanded ? "Hide" : "History"}</button>
          </div>
        </div>
      </div>

      {/* Execution history */}
      {expanded && (
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "4px 0" }}>
          {loadingExec ? (
            <div style={{ padding: "20px", color: "#64748b", fontSize: 13, textAlign: "center" }}>Loading executions…</div>
          ) : executions.length === 0 ? (
            <div style={{ padding: "20px", color: "#475569", fontSize: 13, textAlign: "center" }}>
              No executions yet — waiting for the next signal.
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    {["Time", "Action", "Qty", "Risk", "Status", "Mode", "Latency"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "#475569", textAlign: "left", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {executions.map((ex) => {
                    const ac = ACTION_CONFIG[ex.action] ?? { color: "#64748b", label: ex.action };
                    const sc = EXEC_STATUS_CONFIG[ex.status] ?? { color: "#64748b" };
                    return (
                      <tr key={ex.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.1s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "8px 14px", fontSize: 12, color: "#64748b" }}>
                          {new Date(ex.created_at).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: ac.color, background: ac.color + "15", padding: "2px 7px", borderRadius: 4 }}>{ac.label}</span>
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
                          {ex.computed_quantity ?? "—"}
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: 12, color: ex.risk_result === "PASS" ? "#10b981" : ex.risk_result === "BLOCK" ? "#ef4444" : "#64748b" }}>
                          {ex.risk_result ?? "—"}
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: sc.color }}>{ex.status}</span>
                        </td>
                        <td style={{ padding: "8px 14px" }}>
                          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: ex.execution_mode === "DRY_RUN" ? "rgba(139,92,246,0.12)" : "rgba(6,182,212,0.12)", color: ex.execution_mode === "DRY_RUN" ? "#8b5cf6" : "#06b6d4" }}>
                            {ex.execution_mode}
                          </span>
                        </td>
                        <td style={{ padding: "8px 14px", fontSize: 12, color: "#64748b" }}>
                          {ex.execution_latency_ms ? `${ex.execution_latency_ms}ms` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function btnStyle(color: string) {
  return {
    padding: "5px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
    background: `${color}12`, border: `1px solid ${color}30`,
    color, transition: "all 0.15s",
  } as React.CSSProperties;
}

export default function MyStrategiesPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.get("/influencer/subscriptions")
      .then((r) => setSubscriptions(r.data.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAction = async (id: string, action: "pause" | "resume" | "stop") => {
    setActionLoading(id + action);
    try {
      if (action === "pause") await api.post(`/influencer/subscriptions/${id}/pause`);
      else if (action === "resume") await api.post(`/influencer/subscriptions/${id}/resume`);
      else if (action === "stop") await api.delete(`/influencer/subscriptions/${id}`);
      load();
    } catch { }
    finally { setActionLoading(null); }
  };

  const active = subscriptions.filter((s) => s.status === "active");
  const paused = subscriptions.filter((s) => s.status === "paused");
  const stopped = subscriptions.filter((s) => s.status === "stopped");

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>My Strategies</h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
            Manage your active strategy subscriptions and execution history.
          </p>
        </div>
        <Link href="/influencer" style={{
          padding: "9px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
          color: "#fff", textDecoration: "none",
        }}>+ Browse Strategies</Link>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#64748b" }}>Loading subscriptions…</div>
      ) : subscriptions.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "80px 24px",
          background: "rgba(255,255,255,0.02)", borderRadius: 20,
          border: "1px dashed rgba(255,255,255,0.08)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0", marginBottom: 8 }}>No active strategies</div>
          <div style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
            Subscribe to an influencer strategy to get started.
          </div>
          <Link href="/influencer" style={{
            display: "inline-block", padding: "10px 24px", borderRadius: 10,
            background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
            color: "#fff", textDecoration: "none", fontSize: 14, fontWeight: 600,
          }}>Browse Strategies</Link>
        </div>
      ) : (
        <>
          {/* Summary pills */}
          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            {[
              { label: "Active", count: active.length, color: "#10b981" },
              { label: "Paused", count: paused.length, color: "#f59e0b" },
              { label: "Stopped", count: stopped.length, color: "#64748b" },
            ].map((pill) => (
              <div key={pill.label} style={{
                padding: "8px 16px", borderRadius: 10, fontSize: 13,
                background: `${pill.color}10`, border: `1px solid ${pill.color}25`,
                color: pill.color, fontWeight: 500,
              }}>
                {pill.count} {pill.label}
              </div>
            ))}
          </div>

          {/* Sections */}
          {active.length > 0 && <Section title="Active" subs={active} onAction={handleAction} />}
          {paused.length > 0 && <Section title="Paused" subs={paused} onAction={handleAction} />}
          {stopped.length > 0 && <Section title="Stopped" subs={stopped} onAction={handleAction} />}
        </>
      )}
    </div>
  );
}

function Section({ title, subs, onAction }: {
  title: string;
  subs: Subscription[];
  onAction: (id: string, action: "pause" | "resume" | "stop") => void;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {subs.map((sub) => (
          <SubscriptionCard key={sub.id} sub={sub} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}
