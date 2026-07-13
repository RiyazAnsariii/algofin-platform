"use client";
// src/app/(app)/risk/page.tsx
// AlgoFin v2 — Phase D: Risk Controls
// Create, manage, and monitor risk rules. Live RiskEvent notifications via WebSocket.

import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import marketDataSocket from "@/lib/marketDataSocket";
import { useAuthStore } from "@/stores/auth.store";

// ── Types ─────────────────────────────────────────────────────────────────────
type RuleType = "MAX_DAILY_LOSS" | "MAX_POSITION_SIZE" | "MAX_OPEN_POSITIONS" | "MAX_ORDER_SIZE";
type RuleAction = "reject" | "alert";

interface RiskRule {
  id:                string;
  name:              string;
  rule_type:         RuleType;
  threshold:         string;
  action:            RuleAction;
  symbol:            string | null;
  is_active:         boolean;
  triggered_count:   number;
  last_triggered_at: string | null;
  created_at:        string;
}

interface RiskViolation {
  id:            string;
  rule_id:       string;
  rule_type:     string;
  threshold:     string;
  current_value: string;
  action_taken:  string;
  symbol:        string | null;
  note:          string | null;
  occurred_at:   string;
}

interface LiveRiskAlert {
  ruleName:     string;
  ruleType:     string;
  threshold:    number;
  currentValue: number;
  actionTaken:  string;
  symbol:       string;
  ts:           number;
}

// ── Rule type meta ────────────────────────────────────────────────────────────
const RULE_META: Record<RuleType, { label: string; unit: string; description: string }> = {
  MAX_DAILY_LOSS: {
    label:       "Max Daily Loss",
    unit:        "USDT",
    description: "Block orders if today's realized PnL goes below −{threshold} USDT",
  },
  MAX_POSITION_SIZE: {
    label:       "Max Position Size",
    unit:        "contracts",
    description: "Block orders that would push position above {threshold} contracts",
  },
  MAX_OPEN_POSITIONS: {
    label:       "Max Open Positions",
    unit:        "positions",
    description: "Block orders if you already have {threshold}+ open positions",
  },
  MAX_ORDER_SIZE: {
    label:       "Max Order Size",
    unit:        "contracts",
    description: "Block any single order with quantity > {threshold} contracts",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: string | number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });

const actionBadge = (action: RuleAction) =>
  action === "reject"
    ? "bg-rose-500/15 text-rose-400 border-rose-500/20"
    : "bg-amber-500/15 text-amber-400 border-amber-500/20";

const ruleTypeBadge: Record<RuleType, string> = {
  MAX_DAILY_LOSS:     "bg-red-500/10 text-red-400",
  MAX_POSITION_SIZE:  "bg-purple-500/10 text-purple-400",
  MAX_OPEN_POSITIONS: "bg-blue-500/10 text-blue-400",
  MAX_ORDER_SIZE:     "bg-orange-500/10 text-orange-400",
};

// ── Create Rule form ──────────────────────────────────────────────────────────
function CreateRuleForm({ onSuccess }: { onSuccess: () => void }) {
  const [name,      setName]      = useState("");
  const [ruleType,  setRuleType]  = useState<RuleType>("MAX_DAILY_LOSS");
  const [threshold, setThreshold] = useState("");
  const [action,    setAction]    = useState<RuleAction>("reject");
  const [symbol,    setSymbol]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/risk/rules", {
        name,
        rule_type: ruleType,
        threshold: Number(threshold),
        action,
        symbol: symbol.trim() ? symbol.trim().toUpperCase() : undefined,
      });
      setName(""); setThreshold(""); setSymbol("");
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Failed to create rule");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors";
  const labelCls = "block text-xs font-medium text-muted-foreground mb-1.5";
  const meta = RULE_META[ruleType];

  return (
    <div className="surface-card p-6">
      <h2 className="text-sm font-semibold text-foreground mb-5">New Risk Rule</h2>
      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className={labelCls}>Rule Name</label>
          <input
            id="risk-rule-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My daily loss guard"
            required
            className={inputCls}
          />
        </div>

        {/* Type */}
        <div>
          <label className={labelCls}>Rule Type</label>
          <select
            id="risk-rule-type"
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value as RuleType)}
            className={inputCls}
          >
            {(Object.keys(RULE_META) as RuleType[]).map((t) => (
              <option key={t} value={t}>{RULE_META[t].label}</option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
            {meta.description.replace("{threshold}", threshold || "N")}
          </p>
        </div>

        {/* Threshold */}
        <div>
          <label className={labelCls}>Limit ({meta.unit})</label>
          <input
            id="risk-rule-threshold"
            type="number"
            step="any"
            min="0"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="500"
            required
            className={inputCls}
          />
        </div>

        {/* Action */}
        <div>
          <label className={labelCls}>Action</label>
          <div className="grid grid-cols-2 gap-2">
            {(["reject", "alert"] as RuleAction[]).map((a) => (
              <button
                key={a}
                type="button"
                id={`risk-action-${a}`}
                onClick={() => setAction(a)}
                className={`py-2 rounded-lg text-xs font-semibold border transition-all ${
                  action === a
                    ? a === "reject"
                      ? "bg-rose-500/20 border-rose-500/40 text-rose-400"
                      : "bg-amber-500/20 border-amber-500/40 text-amber-400"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {a === "reject" ? "🚫 Block Order" : "🔔 Alert Only"}
              </button>
            ))}
          </div>
        </div>

        {/* Symbol (optional) */}
        <div>
          <label className={labelCls}>Symbol (optional — leave blank for global)</label>
          <input
            id="risk-rule-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="BTCUSDT"
            className={inputCls}
          />
        </div>

        <button
          id="risk-rule-submit"
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Rule"}
        </button>
      </form>
    </div>
  );
}

// ── Rule card ─────────────────────────────────────────────────────────────────
function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule:     RiskRule;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const meta = RULE_META[rule.rule_type];

  return (
    <div className={`surface-card p-4 border transition-all ${
      rule.is_active ? "border-white/8" : "border-white/4 opacity-60"
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ruleTypeBadge[rule.rule_type]}`}>
              {meta.label}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${actionBadge(rule.action)}`}>
              {rule.action === "reject" ? "BLOCK" : "ALERT"}
            </span>
            {rule.symbol && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-muted-foreground border border-white/10">
                {rule.symbol}
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle */}
          <button
            id={`rule-toggle-${rule.id}`}
            onClick={() => onToggle(rule.id, !rule.is_active)}
            title={rule.is_active ? "Disable rule" : "Enable rule"}
            className={`w-9 h-5 rounded-full border transition-all relative ${
              rule.is_active
                ? "bg-primary/30 border-primary/50"
                : "bg-white/10 border-white/20"
            }`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
              rule.is_active ? "left-4 bg-primary" : "left-0.5 bg-muted-foreground"
            }`} />
          </button>
          <button
            id={`rule-delete-${rule.id}`}
            onClick={() => onDelete(rule.id)}
            className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-all"
            title="Delete rule"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Limit: <span className="text-foreground font-medium">{fmt(rule.threshold)} {meta.unit}</span>
        </span>
        {rule.triggered_count > 0 ? (
          <span className="text-rose-400">
            ⚡ Triggered {rule.triggered_count}×
          </span>
        ) : (
          <span className="text-emerald-500/60">No triggers</span>
        )}
      </div>
    </div>
  );
}

// ── Live alert toast ──────────────────────────────────────────────────────────
function AlertToast({ alert, onDismiss }: { alert: LiveRiskAlert; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 surface-card p-4 border border-rose-500/30 shadow-2xl animate-slide-in">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 text-sm">
          🛡️
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-rose-400 mb-0.5">
            Risk Rule Triggered
          </p>
          <p className="text-xs font-medium text-foreground">{alert.ruleName}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {RULE_META[alert.ruleType as RuleType]?.label ?? alert.ruleType}:&nbsp;
            <span className="text-rose-400 font-semibold">{fmt(alert.currentValue)}</span>
            &nbsp;/&nbsp;{fmt(alert.threshold)}
            {alert.symbol ? ` · ${alert.symbol}` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {alert.actionTaken === "order_rejected" ? "🚫 Order blocked" : "🔔 Alert sent"}
          </p>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground text-xs shrink-0">✕</button>
      </div>
    </div>
  );
}

// ── Main Risk Controls page ───────────────────────────────────────────────────
export default function RiskPage() {
  const [rules,      setRules]      = useState<RiskRule[]>([]);
  const [violations, setViolations] = useState<RiskViolation[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [activeAlert, setActiveAlert] = useState<LiveRiskAlert | null>(null);
  const [tab, setTab] = useState<"rules" | "history">("rules");
  const accessToken = useAuthStore((s) => s.accessToken);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  const fetchRules = useCallback(async () => {
    try {
      const res = await api.get<{ data: RiskRule[] }>("/risk/rules?include_inactive=true");
      setRules(res.data.data);
    } catch { /* handled */ } finally {
      setLoading(false);
    }
  }, []);

  const fetchViolations = useCallback(async () => {
    try {
      const res = await api.get<{ data: RiskViolation[] }>("/risk/violations");
      setViolations(res.data.data);
    } catch { /* handled */ }
  }, []);

  useEffect(() => { fetchRules(); fetchViolations(); }, [fetchRules, fetchViolations]);

  // ── Live risk events via WebSocket ────────────────────────────────────────
  useEffect(() => {
    if (!accessToken) return;

    const handleMsg = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== "risk_event") return;
        setActiveAlert({
          ruleName:     data.ruleName    ?? "",
          ruleType:     data.ruleType    ?? "",
          threshold:    data.threshold   ?? 0,
          currentValue: data.currentValue ?? 0,
          actionTaken:  data.actionTaken ?? "",
          symbol:       data.symbol       ?? "",
          ts:           Date.now(),
        });
        // Refresh rules + violations in background
        fetchRules();
        fetchViolations();
      } catch { /* ignore */ }
    };

    // Tap into the raw WS — marketDataSocket doesn't expose a risk_event handler yet
    // We subscribe to the socket's underlying events via a custom hook pattern
    marketDataSocket.connect(accessToken);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socket = marketDataSocket as any;
    const ws: WebSocket | null = socket.ws;
    if (ws) ws.addEventListener("message", handleMsg);

    return () => {
      if (ws) ws.removeEventListener("message", handleMsg);
    };
  }, [accessToken, fetchRules, fetchViolations]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleToggle = async (id: string, active: boolean) => {
    await api.patch(`/risk/rules/${id}`, { is_active: active });
    await fetchRules();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/risk/rules/${id}`);
    await fetchRules();
  };

  const wsStatus = marketDataSocket.getStatus();

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Risk Controls</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              Automated guardrails evaluated before every order
            </p>
            {wsStatus === "connected" && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold
                bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active Rules",   value: rules.filter(r => r.is_active).length,   color: "text-emerald-400" },
          { label: "Total Rules",    value: rules.length,                             color: "text-foreground" },
          { label: "Total Triggers", value: rules.reduce((a, r) => a + r.triggered_count, 0), color: "text-rose-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="surface-card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create rule form */}
        <div className="lg:col-span-1">
          <CreateRuleForm onSuccess={fetchRules} />
        </div>

        {/* Rules + History panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1">
            {(["rules", "history"] as const).map((t) => (
              <button
                key={t}
                id={`risk-tab-${t}`}
                onClick={() => { setTab(t); if (t === "history") fetchViolations(); }}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-white/5 text-muted-foreground border border-white/10 hover:bg-white/10"
                }`}
              >
                {t === "rules" ? "Rules" : "Violation History"}
              </button>
            ))}
          </div>

          {/* Rules list */}
          {tab === "rules" && (
            loading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : rules.length === 0 ? (
              <div className="surface-card p-10 text-center">
                <p className="text-4xl mb-3">🛡️</p>
                <p className="font-semibold text-foreground">No risk rules yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create a rule to automatically protect your account
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {rules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )
          )}

          {/* Violation history */}
          {tab === "history" && (
            <div className="surface-card overflow-hidden">
              {violations.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No violations recorded
                </div>
              ) : (
                violations.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-white/4 last:border-0 gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-1.5 py-0.5 rounded font-bold ${ruleTypeBadge[v.rule_type as RuleType] ?? "bg-white/5 text-muted-foreground"}`}>
                        {RULE_META[v.rule_type as RuleType]?.label ?? v.rule_type}
                      </span>
                      {v.symbol && <span className="text-muted-foreground">{v.symbol}</span>}
                      <span className={v.action_taken === "order_rejected" ? "text-rose-400" : "text-amber-400"}>
                        {v.action_taken === "order_rejected" ? "🚫 Blocked" : "🔔 Alerted"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-muted-foreground">
                      <span>
                        Value: <span className="text-rose-400 font-semibold">{fmt(v.current_value)}</span>
                        {" / "}
                        {fmt(v.threshold)}
                      </span>
                      <span className="hidden sm:inline">
                        {new Date(v.occurred_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live alert toast */}
      {activeAlert && (
        <AlertToast
          alert={activeAlert}
          onDismiss={() => setActiveAlert(null)}
        />
      )}
    </div>
  );
}
