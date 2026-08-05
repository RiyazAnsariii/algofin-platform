"use client";
// src/app/(app)/influencer/[id]/page.tsx
// Phase INF — Strategy Detail Page

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

interface Strategy {
  id: string;
  strategy_code: string;
  name: string;
  description: string | null;
  creator_name: string;
  creator_avatar_url: string | null;
  supported_markets: string[];
  recommended_timeframe: string | null;
  risk_level: string;
  backtested_return: string | null;
  max_drawdown: string | null;
  win_rate: string | null;
  total_trades: number | null;
  equity_curve: any[];
  status: string;
  version: string;
}

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: "Low Risk",    color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  medium: { label: "Medium Risk", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  high:   { label: "High Risk",   color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: "-0.03em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function StrategyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get(`/influencer/marketplace/${id}`)
      .then((r) => setStrategy(r.data.data))
      .catch(() => router.push("/influencer"))
      .finally(() => setLoading(false));
  }, [id, router]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", color: "#64748b" }}>
        Loading strategy...
      </div>
    );
  }

  if (!strategy) return null;

  const risk = RISK_CONFIG[strategy.risk_level] ?? RISK_CONFIG.medium;
  const initials = strategy.creator_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      {/* Back */}
      <Link href="/influencer" style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        color: "#64748b", fontSize: 13, textDecoration: "none", marginBottom: 24,
        transition: "color 0.15s",
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to Marketplace
      </Link>

      {/* Hero */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 20, padding: 28, marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {strategy.creator_avatar_url ? (
              <img src={strategy.creator_avatar_url} alt={strategy.creator_name}
                style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(6,182,212,0.3)" }} />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 700, color: "#fff",
              }}>{initials}</div>
            )}
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>{strategy.name}</h1>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                by {strategy.creator_name}
                <span style={{ margin: "0 8px", color: "#374151" }}>·</span>
                <span style={{ fontFamily: "monospace", color: "#475569", fontSize: 12 }}>v{strategy.version}</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 20,
              color: risk.color, background: risk.bg, border: `1px solid ${risk.color}30`,
            }}>{risk.label}</span>
            <button onClick={() => setShowModal(true)} style={{
              padding: "10px 24px", borderRadius: 10, fontSize: 14, fontWeight: 600,
              background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
              color: "#fff", border: "none", cursor: "pointer",
            }}>Use Strategy</button>
          </div>
        </div>

        {strategy.description && (
          <p style={{ marginTop: 20, fontSize: 14, color: "#94a3b8", lineHeight: 1.6, maxWidth: 600 }}>
            {strategy.description}
          </p>
        )}
      </div>

      {/* Performance Metrics */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8", marginBottom: 14 }}>Performance Metrics</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
          <MetricCard label="Win Rate" value={strategy.win_rate ? `${parseFloat(strategy.win_rate).toFixed(1)}%` : "—"} color="#10b981" />
          <MetricCard label="Backtested Return" value={strategy.backtested_return ? `+${parseFloat(strategy.backtested_return).toFixed(1)}%` : "—"} color="#06b6d4" sub="Historical" />
          <MetricCard label="Max Drawdown" value={strategy.max_drawdown ? `-${parseFloat(strategy.max_drawdown).toFixed(1)}%` : "—"} color="#f59e0b" sub="Peak-to-trough" />
          <MetricCard label="Total Trades" value={strategy.total_trades?.toLocaleString() ?? "—"} color="#8b5cf6" sub="Backtested" />
        </div>
      </div>

      {/* Markets & Timeframe */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "20px 24px", marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>Strategy Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Supported Markets</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {strategy.supported_markets?.length > 0 ? strategy.supported_markets.map((m) => (
                <span key={m} style={{
                  fontSize: 12, padding: "3px 10px", borderRadius: 6,
                  background: "rgba(6,182,212,0.08)", color: "#06b6d4",
                  border: "1px solid rgba(6,182,212,0.15)",
                }}>{m}</span>
              )) : <span style={{ color: "#475569", fontSize: 13 }}>All markets</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>Recommended Timeframe</div>
            <span style={{
              fontSize: 14, fontWeight: 600, color: "#8b5cf6",
              background: "rgba(139,92,246,0.1)", padding: "4px 12px",
              borderRadius: 8, border: "1px solid rgba(139,92,246,0.2)",
            }}>{strategy.recommended_timeframe ?? "Any"}</span>
          </div>
        </div>
      </div>

      {/* Equity Curve placeholder */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "20px 24px", marginBottom: 32,
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8", marginBottom: 16 }}>Equity Curve</h2>
        {strategy.equity_curve?.length > 0 ? (
          <EquityCurveChart data={strategy.equity_curve} />
        ) : (
          <div style={{
            height: 120, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#475569", fontSize: 13, border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 10,
          }}>
            Equity curve data will appear here once live trading begins.
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{
        background: "linear-gradient(135deg, rgba(6,182,212,0.08), rgba(139,92,246,0.08))",
        border: "1px solid rgba(6,182,212,0.2)", borderRadius: 16, padding: "24px",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20, flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>
            Ready to use this strategy?
          </div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Configure your capital and risk settings, then activate.
          </div>
        </div>
        <button onClick={() => setShowModal(true)} style={{
          padding: "12px 28px", borderRadius: 12, fontSize: 14, fontWeight: 600,
          background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
          color: "#fff", border: "none", cursor: "pointer",
          boxShadow: "0 4px 20px rgba(6,182,212,0.3)",
        }}>Use Strategy</button>
      </div>

      {showModal && (
        <SubscribeModal strategy={strategy} onClose={() => setShowModal(false)} />
      )}
    </div>
  );
}

// ── Simple equity curve sparkline ─────────────────────────────────────────────
function EquityCurveChart({ data }: { data: number[] }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 600, h = 120;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.85 - h * 0.075;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 120 }}>
      <defs>
        <linearGradient id="ecGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={points} fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

// ── Subscribe modal (reused from marketplace page) ───────────────────────────
interface Exchange { id: string; name: string; exchange: string; }

function SubscribeModal({ strategy, onClose }: { strategy: Strategy; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [form, setForm] = useState({ exchange_account_id: "", symbol: "BTCUSDT", capital_usdt: "100", leverage: 1 });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get("/exchanges").then((r) => {
      setExchanges(r.data.data ?? []);
      if (r.data.data?.length > 0) setForm((f) => ({ ...f, exchange_account_id: r.data.data[0].id }));
    }).catch(() => {});
  }, []);

  const stepLabels = ["Exchange", "Symbol", "Capital", "Leverage", "Activate"];
  const canNext = () => {
    if (step === 1) return !!form.exchange_account_id;
    if (step === 2) return form.symbol.length >= 2;
    if (step === 3) return parseFloat(form.capital_usdt) >= 10;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/influencer/subscriptions", {
        influencer_strategy_id: strategy.id,
        exchange_account_id: form.exchange_account_id,
        symbol: form.symbol.toUpperCase(),
        capital_usdt: parseFloat(form.capital_usdt),
        leverage: form.leverage,
      });
      setSuccess(true);
      setTimeout(() => { onClose(); router.push("/influencer/my-strategies"); }, 1500);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Subscription failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 24,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#0f1117", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 20, padding: 32, width: "100%", maxWidth: 440,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>Activate Strategy</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {stepLabels.map((l, i) => (
            <div key={l} style={{ flex: 1 }}>
              <div style={{ height: 3, borderRadius: 2, background: i + 1 <= step ? "linear-gradient(90deg,#06b6d4,#8b5cf6)" : "rgba(255,255,255,0.07)" }} />
              <div style={{ fontSize: 10, color: i + 1 === step ? "#06b6d4" : "#475569", marginTop: 4, textAlign: "center" }}>{l}</div>
            </div>
          ))}
        </div>
        {success ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ color: "#10b981", fontWeight: 600 }}>Strategy Activated!</div>
          </div>
        ) : (
          <>
            <div style={{ minHeight: 120, marginBottom: 20 }}>
              {step === 1 && <div>
                <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 8 }}>Exchange Account</label>
                <select value={form.exchange_account_id} onChange={(e) => setForm((f) => ({ ...f, exchange_account_id: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }}>
                  {exchanges.map((ex) => <option key={ex.id} value={ex.id} style={{ background: "#1a1f2e" }}>{ex.name}</option>)}
                </select>
              </div>}
              {step === 2 && <div>
                <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 8 }}>Symbol</label>
                <input value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
              </div>}
              {step === 3 && <div>
                <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 8 }}>Capital (USDT)</label>
                <input type="number" min={10} value={form.capital_usdt} onChange={(e) => setForm((f) => ({ ...f, capital_usdt: e.target.value }))}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0", fontSize: 13, outline: "none" }} />
              </div>}
              {step === 4 && <div>
                <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 12 }}>Leverage: <strong style={{ color: "#e2e8f0" }}>{form.leverage}×</strong></label>
                <input type="range" min={1} max={125} value={form.leverage} onChange={(e) => setForm((f) => ({ ...f, leverage: parseInt(e.target.value) }))} style={{ width: "100%", accentColor: "#06b6d4" }} />
              </div>}
              {step === 5 && <div style={{ fontSize: 13 }}>
                {[["Strategy", strategy.name], ["Symbol", form.symbol], ["Capital", `$${form.capital_usdt}`], ["Leverage", `${form.leverage}×`]].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: "#64748b" }}>{k}</span><span style={{ color: "#e2e8f0" }}>{v}</span>
                  </div>
                ))}
              </div>}
            </div>
            {error && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              {step > 1 && <button onClick={() => setStep((s) => s - 1)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>Back</button>}
              {step < 5 ? (
                <button onClick={() => canNext() && setStep((s) => s + 1)} disabled={!canNext()} style={{ flex: 2, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, background: canNext() ? "linear-gradient(135deg,#06b6d4,#8b5cf6)" : "rgba(255,255,255,0.05)", color: canNext() ? "#fff" : "#475569", border: "none", cursor: canNext() ? "pointer" : "default" }}>Continue</button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting} style={{ flex: 2, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff", border: "none", cursor: "pointer" }}>{submitting ? "Activating…" : "Activate"}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
