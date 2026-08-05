"use client";
// src/app/(app)/influencer/page.tsx
// Phase INF — Influencer Strategy Marketplace

import { useEffect, useState } from "react";
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
  risk_level: "low" | "medium" | "high";
  backtested_return: string | null;
  max_drawdown: string | null;
  win_rate: string | null;
  total_trades: number | null;
  status: string;
}

const RISK_CONFIG = {
  low:    { label: "Low Risk",    color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  medium: { label: "Medium Risk", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  high:   { label: "High Risk",   color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? "#e2e8f0", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function StrategyCard({ s, onUse }: { s: Strategy; onUse: (s: Strategy) => void }) {
  const risk = RISK_CONFIG[s.risk_level] ?? RISK_CONFIG.medium;
  const initials = s.creator_name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: 20,
      transition: "border-color 0.2s, transform 0.2s",
      cursor: "pointer",
    }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(6,182,212,0.35)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.07)";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {s.creator_avatar_url ? (
            <img src={s.creator_avatar_url} alt={s.creator_name}
              style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(255,255,255,0.1)" }} />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: "#fff",
            }}>{initials}</div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{s.name}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{s.creator_name}</div>
          </div>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
          color: risk.color, background: risk.bg, border: `1px solid ${risk.color}30`,
        }}>{risk.label}</span>
      </div>

      {/* Description */}
      {s.description && (
        <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5, margin: 0 }}>
          {s.description.length > 100 ? s.description.slice(0, 100) + "…" : s.description}
        </p>
      )}

      {/* Stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3,1fr)",
        gap: 12, padding: "14px 0",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <StatPill label="Win Rate" value={s.win_rate ? `${parseFloat(s.win_rate).toFixed(1)}%` : "—"} color="#10b981" />
        <StatPill label="Return" value={s.backtested_return ? `+${parseFloat(s.backtested_return).toFixed(1)}%` : "—"} color="#06b6d4" />
        <StatPill label="Drawdown" value={s.max_drawdown ? `-${parseFloat(s.max_drawdown).toFixed(1)}%` : "—"} color="#f59e0b" />
      </div>

      {/* Markets */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {(s.supported_markets ?? []).slice(0, 4).map((m) => (
          <span key={m} style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 6,
            background: "rgba(6,182,212,0.08)", color: "#06b6d4",
            border: "1px solid rgba(6,182,212,0.15)",
          }}>{m}</span>
        ))}
        {s.recommended_timeframe && (
          <span style={{
            fontSize: 11, padding: "2px 8px", borderRadius: 6,
            background: "rgba(139,92,246,0.08)", color: "#8b5cf6",
            border: "1px solid rgba(139,92,246,0.15)",
          }}>{s.recommended_timeframe}</span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <Link href={`/influencer/${s.id}`} style={{
          flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8",
          fontSize: 13, fontWeight: 500, textDecoration: "none",
          transition: "border-color 0.2s, color 0.2s",
        }}>View Details</Link>
        <button onClick={() => onUse(s)} style={{
          flex: 1, padding: "9px 0", borderRadius: 10,
          background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
          color: "#fff", fontSize: 13, fontWeight: 600, border: "none",
          cursor: "pointer", transition: "opacity 0.2s",
        }}>Use Strategy</button>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");

  useEffect(() => {
    api.get("/influencer/marketplace")
      .then((r) => setStrategies(r.data.data ?? []))
      .catch(() => setError("Failed to load strategies"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = strategies.filter((s) => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.creator_name.toLowerCase().includes(search.toLowerCase());
    const matchRisk = riskFilter === "all" || s.risk_level === riskFilter;
    return matchSearch && matchRisk;
  });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(6,182,212,0.2), rgba(139,92,246,0.2))",
            border: "1px solid rgba(6,182,212,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="1.8">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
              <polyline points="16 7 22 7 22 13" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#e2e8f0", margin: 0 }}>
            Strategy Marketplace
          </h1>
        </div>
        <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
          Subscribe to expert strategies — configure your capital and let the engine execute.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search strategies or creators..."
          style={{
            flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            color: "#e2e8f0", fontSize: 13, outline: "none",
          }}
        />
        {(["all", "low", "medium", "high"] as const).map((r) => (
          <button key={r} onClick={() => setRiskFilter(r)} style={{
            padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            cursor: "pointer", border: "1px solid",
            borderColor: riskFilter === r ? "rgba(6,182,212,0.5)" : "rgba(255,255,255,0.08)",
            background: riskFilter === r ? "rgba(6,182,212,0.1)" : "rgba(255,255,255,0.03)",
            color: riskFilter === r ? "#06b6d4" : "#64748b",
            transition: "all 0.15s",
          }}>
            {r === "all" ? "All" : r.charAt(0).toUpperCase() + r.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#64748b" }}>
          <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.5 }}>⟳</div>
          Loading strategies...
        </div>
      ) : error ? (
        <div style={{
          textAlign: "center", padding: "60px 0", color: "#ef4444",
          background: "rgba(239,68,68,0.05)", borderRadius: 12,
          border: "1px solid rgba(239,68,68,0.1)",
        }}>{error}</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "#64748b" }}>
          {strategies.length === 0
            ? "No active strategies yet. Check back soon."
            : "No strategies match your filter."}
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 20,
        }}>
          {filtered.map((s) => (
            <StrategyCard key={s.id} s={s} onUse={setSelectedStrategy} />
          ))}
        </div>
      )}

      {/* Subscription Modal */}
      {selectedStrategy && (
        <SubscriptionModal
          strategy={selectedStrategy}
          onClose={() => setSelectedStrategy(null)}
          onSuccess={() => setSelectedStrategy(null)}
        />
      )}
    </div>
  );
}

// ── Subscription Modal (inline) ───────────────────────────────────────────────
interface Exchange { id: string; name: string; exchange: string; }

function SubscriptionModal({
  strategy, onClose, onSuccess,
}: {
  strategy: Strategy;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState(1);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [form, setForm] = useState({
    exchange_account_id: "",
    symbol: "BTCUSDT",
    capital_usdt: "100",
    leverage: 1,
  });
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
    if (step === 4) return form.leverage >= 1 && form.leverage <= 125;
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
      setTimeout(onSuccess, 1500);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Subscription failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: 24,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: "#0f1117", border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 20, padding: 32, width: "100%", maxWidth: 440,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
      }}>
        {/* Modal header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>Activate Strategy</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 3 }}>{strategy.name}</div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "#64748b",
            fontSize: 20, cursor: "pointer", lineHeight: 1,
          }}>×</button>
        </div>

        {/* Step progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28 }}>
          {stepLabels.map((l, i) => (
            <div key={l} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                height: 3, borderRadius: 2, marginBottom: 5,
                background: i + 1 <= step
                  ? "linear-gradient(90deg,#06b6d4,#8b5cf6)"
                  : "rgba(255,255,255,0.07)",
              }} />
              <div style={{ fontSize: 10, color: i + 1 === step ? "#06b6d4" : "#475569" }}>{l}</div>
            </div>
          ))}
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ color: "#10b981", fontWeight: 600 }}>Strategy Activated!</div>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
              Signals will now fan out to your account.
            </div>
          </div>
        ) : (
          <>
            {/* Step content */}
            <div style={{ minHeight: 140 }}>
              {step === 1 && (
                <div>
                  <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 8 }}>
                    Exchange Account
                  </label>
                  {exchanges.length === 0 ? (
                    <div style={{ color: "#ef4444", fontSize: 13 }}>
                      No exchange accounts found. Add one in Exchanges first.
                    </div>
                  ) : (
                    <select value={form.exchange_account_id}
                      onChange={(e) => setForm((f) => ({ ...f, exchange_account_id: e.target.value }))}
                      style={{
                        width: "100%", padding: "10px 12px", borderRadius: 10,
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "#e2e8f0", fontSize: 13, outline: "none",
                      }}>
                      {exchanges.map((ex) => (
                        <option key={ex.id} value={ex.id} style={{ background: "#1a1f2e" }}>
                          {ex.name} ({ex.exchange})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {step === 2 && (
                <div>
                  <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 8 }}>
                    Trading Symbol
                  </label>
                  <input value={form.symbol}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                    placeholder="e.g. BTCUSDT"
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#e2e8f0", fontSize: 13, outline: "none",
                    }} />
                  {strategy.supported_markets?.length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {strategy.supported_markets.map((m) => (
                        <button key={m} onClick={() => setForm((f) => ({ ...f, symbol: m }))}
                          style={{
                            padding: "3px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                            background: form.symbol === m ? "rgba(6,182,212,0.15)" : "rgba(255,255,255,0.04)",
                            border: `1px solid ${form.symbol === m ? "rgba(6,182,212,0.4)" : "rgba(255,255,255,0.08)"}`,
                            color: form.symbol === m ? "#06b6d4" : "#64748b",
                          }}>{m}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div>
                  <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 8 }}>
                    Capital (USDT) — position notional per signal
                  </label>
                  <input type="number" min={10} value={form.capital_usdt}
                    onChange={(e) => setForm((f) => ({ ...f, capital_usdt: e.target.value }))}
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#e2e8f0", fontSize: 13, outline: "none",
                    }} />
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 8 }}>
                    Minimum $10. This is the position notional — leverage affects margin, not size.
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 12 }}>
                    Leverage: <strong style={{ color: "#e2e8f0" }}>{form.leverage}×</strong>
                  </label>
                  <input type="range" min={1} max={125} value={form.leverage}
                    onChange={(e) => setForm((f) => ({ ...f, leverage: parseInt(e.target.value) }))}
                    style={{ width: "100%", accentColor: "#06b6d4" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginTop: 4 }}>
                    <span>1× (no leverage)</span><span>125×</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#475569", marginTop: 10 }}>
                    Leverage affects required margin only. Quantity = capital ÷ mark price.
                  </div>
                </div>
              )}

              {step === 5 && (
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  <div style={{ marginBottom: 14, fontWeight: 600, color: "#e2e8f0" }}>Review</div>
                  {[
                    ["Strategy", strategy.name],
                    ["Exchange", exchanges.find((e) => e.id === form.exchange_account_id)?.name ?? "—"],
                    ["Symbol", form.symbol],
                    ["Capital", `$${form.capital_usdt} USDT`],
                    ["Leverage", `${form.leverage}×`],
                  ].map(([k, v]) => (
                    <div key={k} style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                    }}>
                      <span style={{ color: "#64748b" }}>{k}</span>
                      <span style={{ color: "#e2e8f0", fontWeight: 500 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div style={{ color: "#ef4444", fontSize: 13, marginTop: 12, padding: "8px 12px", background: "rgba(239,68,68,0.07)", borderRadius: 8 }}>
                {error}
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              {step > 1 && (
                <button onClick={() => setStep((s) => s - 1)} style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  color: "#94a3b8", cursor: "pointer",
                }}>Back</button>
              )}
              {step < 5 ? (
                <button onClick={() => canNext() && setStep((s) => s + 1)}
                  disabled={!canNext()}
                  style={{
                    flex: 2, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600,
                    background: canNext()
                      ? "linear-gradient(135deg,#06b6d4,#8b5cf6)"
                      : "rgba(255,255,255,0.05)",
                    color: canNext() ? "#fff" : "#475569",
                    border: "none", cursor: canNext() ? "pointer" : "default",
                  }}>Continue</button>
              ) : (
                <button onClick={handleSubmit} disabled={submitting} style={{
                  flex: 2, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: "linear-gradient(135deg,#06b6d4,#8b5cf6)",
                  color: "#fff", border: "none", cursor: submitting ? "wait" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}>{submitting ? "Activating…" : "Activate Strategy"}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
