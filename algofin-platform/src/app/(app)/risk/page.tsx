"use client";
// src/app/(app)/risk/page.tsx
// AlgoFin v2 — Risk Controls & Guardrails (matching reference UI)

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { cachedGet, invalidateCachePrefix } from "@/lib/apiCache";
import marketDataSocket from "@/lib/marketDataSocket";
import { useAuthStore } from "@/stores/auth.store";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

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
    description: "Block orders if today's realized PnL goes below -N USDT",
  },
  MAX_POSITION_SIZE: {
    label:       "Max Position Size",
    unit:        "USDT",
    description: "Limit individual position size in USDT",
  },
  MAX_OPEN_POSITIONS: {
    label:       "Max Open Positions",
    unit:        "positions",
    description: "Block orders if you already have N+ open positions",
  },
  MAX_ORDER_SIZE: {
    label:       "Max Order Size",
    unit:        "USDT",
    description: "Block any single order exceeding N USDT in value",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: string | number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });

const actionBadge = (action: RuleAction) =>
  action === "reject"
    ? "bg-rose-500/15 text-rose-400 border-rose-500/20"
    : "bg-amber-500/15 text-amber-400 border-amber-500/20";

const ruleTypeBadge: Record<RuleType, string> = {
  MAX_DAILY_LOSS:     "bg-rose-500/10 text-rose-400 border-rose-500/20",
  MAX_POSITION_SIZE:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
  MAX_OPEN_POSITIONS: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  MAX_ORDER_SIZE:     "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

// ── Create Rule form ──────────────────────────────────────────────────────────
function CreateRuleForm({ onSuccess }: { onSuccess: () => void }) {
  const [name,      setName]      = useState("");
  const [ruleType,  setRuleType]  = useState<RuleType>("MAX_DAILY_LOSS");
  const [threshold, setThreshold] = useState("500");
  const [action,    setAction]    = useState<RuleAction>("reject");
  const [symbol,    setSymbol]    = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/risk/rules", {
        name: name || RULE_META[ruleType].label,
        rule_type: ruleType,
        threshold: Number(threshold),
        action,
        symbol: symbol.trim() ? symbol.trim().toUpperCase() : undefined,
      });
      invalidateCachePrefix("/risk");
      setName(""); setThreshold("500"); setSymbol("");
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Failed to create rule");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan-400/50 transition-colors";
  const labelCls = "block text-xs font-semibold text-muted-foreground mb-1.5";
  const meta = RULE_META[ruleType];

  return (
    <div className="surface-card p-6 space-y-5 h-full flex flex-col justify-between">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Create New Risk Rule</h2>
        {error && (
          <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Rule Name */}
          <div>
            <label className={labelCls}>Rule Name</label>
            <input
              id="risk-rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., My daily loss guard"
              className={inputCls}
            />
          </div>

          {/* Rule Type */}
          <div>
            <label className={labelCls}>Rule Type</label>
            <div className="relative">
              <select
                id="risk-rule-type"
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value as RuleType)}
                className={`${inputCls} appearance-none pr-8 cursor-pointer`}
              >
                {(Object.keys(RULE_META) as RuleType[]).map((t) => (
                  <option key={t} value={t}>{RULE_META[t].label}</option>
                ))}
              </select>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute right-3 top-3 text-muted-foreground pointer-events-none">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground/70 leading-relaxed">
              {meta.description}
            </p>
          </div>

          {/* Limit */}
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
              <button
                type="button"
                id="risk-action-reject"
                onClick={() => setAction("reject")}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                  action === "reject"
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
                Block Order
              </button>
              <button
                type="button"
                id="risk-action-alert"
                onClick={() => setAction("alert")}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                  action === "alert"
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                    : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Alert Only
              </button>
            </div>
          </div>

          {/* Symbol (optional) */}
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Symbol (optional)</label>
              <span className="text-muted-foreground/60 text-[10px]" title="Target specific symbol or leave blank for all">ⓘ</span>
            </div>
            <input
              id="risk-rule-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g., BTCUSDT (leave blank for all)"
              className={inputCls}
            />
          </div>

          <button
            id="risk-rule-submit"
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-semibold transition-all shadow-glow-cyan disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Rule"}
          </button>
        </form>
      </div>

      {/* ── Quick Presets to fill space cleanly ── */}
      <div className="pt-4 border-t border-white/6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Presets</span>
          <span className="text-[10px] text-cyan-400 font-medium">Click to fill form</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => {
              setName("Daily $200 Loss Cap");
              setRuleType("MAX_DAILY_LOSS");
              setThreshold("200");
              setAction("reject");
              setSymbol("");
            }}
            className="p-2.5 rounded-xl border border-white/6 bg-white/[0.02] hover:border-cyan-500/30 text-left transition-all space-y-0.5 group"
          >
            <p className="font-semibold text-foreground group-hover:text-cyan-400 transition-colors text-[11px]">$200 Daily Cap</p>
            <p className="text-[10px] text-muted-foreground">Block on $200 loss</p>
          </button>

          <button
            type="button"
            onClick={() => {
              setName("Max 5 Open Positions");
              setRuleType("MAX_OPEN_POSITIONS");
              setThreshold("5");
              setAction("reject");
              setSymbol("");
            }}
            className="p-2.5 rounded-xl border border-white/6 bg-white/[0.02] hover:border-cyan-500/30 text-left transition-all space-y-0.5 group"
          >
            <p className="font-semibold text-foreground group-hover:text-cyan-400 transition-colors text-[11px]">Max 5 Trades</p>
            <p className="text-[10px] text-muted-foreground">Limit open positions</p>
          </button>
        </div>

        <div className="px-3 py-2 rounded-xl bg-cyan-500/8 border border-cyan-500/20 text-[11px] text-cyan-400 flex items-start gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <span className="leading-snug">
            Rules evaluate automatically in ~15ms prior to order execution.
          </span>
        </div>
      </div>
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
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${ruleTypeBadge[rule.rule_type]}`}>
              {meta.label}
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${actionBadge(rule.action)}`}>
              {rule.action === "reject" ? "BLOCK" : "ALERT"}
            </span>
            {rule.symbol && (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white/5 text-muted-foreground border border-white/10">
                {rule.symbol}
              </span>
            )}
          </div>
          <p className="text-xs font-semibold text-foreground truncate">{rule.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle */}
          <button
            id={`rule-toggle-${rule.id}`}
            onClick={() => onToggle(rule.id, !rule.is_active)}
            title={rule.is_active ? "Disable rule" : "Enable rule"}
            className={`w-9 h-5 rounded-full border transition-all relative ${
              rule.is_active
                ? "bg-cyan-500/30 border-cyan-500/50"
                : "bg-white/10 border-white/20"
            }`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
              rule.is_active ? "left-4 bg-cyan-400" : "left-0.5 bg-muted-foreground"
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
  const showSkeleton                = useDelayedLoading(loading);
  const [activeAlert, setActiveAlert] = useState<LiveRiskAlert | null>(null);
  const [tab, setTab]               = useState<"rules" | "history">("rules");
  const accessToken                 = useAuthStore((s) => s.accessToken);

  const fetchRules = useCallback(async () => {
    try {
      const data = await cachedGet<RiskRule[]>("/risk/rules?include_inactive=true", 30_000);
      setRules(data);
    } catch {
      /* handled */
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchViolations = useCallback(async () => {
    try {
      const data = await cachedGet<RiskViolation[]>("/risk/violations", 20_000);
      setViolations(data);
    } catch {
      /* handled */
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchViolations();
  }, [fetchRules, fetchViolations]);

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
        invalidateCachePrefix("/risk");
        fetchRules();
        fetchViolations();
      } catch {
        /* ignore */
      }
    };

    marketDataSocket.connect(accessToken);
    const socket = marketDataSocket as any;
    const ws: WebSocket | null = socket.ws;
    if (ws) ws.addEventListener("message", handleMsg);

    return () => {
      if (ws) ws.removeEventListener("message", handleMsg);
    };
  }, [accessToken, fetchRules, fetchViolations]);

  const handleToggle = async (id: string, active: boolean) => {
    await api.patch(`/risk/rules/${id}`, { is_active: active });
    invalidateCachePrefix("/risk");
    await fetchRules();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/risk/rules/${id}`);
    invalidateCachePrefix("/risk");
    await fetchRules();
  };

  const activeRulesCount = rules.filter((r) => r.is_active).length;
  const totalTriggersCount = rules.reduce((a, r) => a + r.triggered_count, 0);
  const blockedOrdersCount = violations.filter((v) => v.action_taken === "order_rejected").length;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* ── Top Header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Risk Controls</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated guardrails evaluated before every order
          </p>
        </div>
        <button className="px-3.5 py-1.5 rounded-xl border border-white/6 bg-white/[0.02] text-xs font-semibold text-foreground hover:text-cyan-400 transition-colors flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">?</span>
          How it works
        </button>
      </div>

      {/* ── Top 4 Stat Cards Grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Rules */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Rules</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{activeRulesCount}</p>
            <p className="text-xs text-muted-foreground">Currently protecting your account</p>
          </div>
        </div>

        {/* Card 2: Total Rules */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <path d="M8 14h4" />
                <path d="M8 18h6" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Rules</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{rules.length}</p>
            <p className="text-xs text-muted-foreground">All time created rules</p>
          </div>
        </div>

        {/* Card 3: Total Triggers */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Triggers</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalTriggersCount}</p>
            <p className="text-xs text-muted-foreground">Rules triggered so far</p>
          </div>
        </div>

        {/* Card 4: Blocked Orders */}
        <div className="surface-card p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Blocked Orders</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{blockedOrdersCount}</p>
            <p className="text-xs text-muted-foreground">Orders prevented</p>
          </div>
        </div>
      </div>

      {/* ── Main Body Grid (2 Columns) ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (~38% width): Create New Risk Rule Form */}
        <div className="lg:col-span-5 flex flex-col">
          <CreateRuleForm onSuccess={fetchRules} />
        </div>

        {/* Right Column (~62% width): Upper Panel + Lower Templates */}
        <div className="lg:col-span-7 space-y-5 flex flex-col justify-between">
          {/* Upper Panel: Rules / Violation History Card */}
          <div className="surface-card p-6 space-y-6 flex-1 flex flex-col justify-between min-h-[340px]">
            {/* Header Tabs Row */}
            <div className="flex items-center justify-between border-b border-white/6 pb-3">
              <div className="flex gap-6 text-xs font-semibold">
                <button
                  onClick={() => setTab("rules")}
                  className={`pb-3 -mb-3 transition-colors relative ${
                    tab === "rules" ? "text-cyan-400 font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Rules
                  {tab === "rules" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />}
                </button>
                <button
                  onClick={() => { setTab("history"); fetchViolations(); }}
                  className={`pb-3 -mb-3 transition-colors relative ${
                    tab === "history" ? "text-cyan-400 font-bold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Violation History
                  {tab === "history" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />}
                </button>
              </div>

              <button className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium">
                Manage Rules
              </button>
            </div>

            {/* Tab 1 Content: Rules List or Empty State */}
            {tab === "rules" && (
              showSkeleton ? (
                <div className="space-y-3 py-4">
                  {[1, 2].map((i) => <div key={i} className="skeleton h-16 w-full" />)}
                </div>
              ) : rules.length > 0 ? (
                <div className="space-y-3 overflow-y-auto max-h-[260px] pr-1">
                  {rules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="relative w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">No risk rules yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Create a rule to automatically protect your account</p>
                  </div>
                  <button
                    onClick={() => {
                      document.getElementById("risk-rule-name")?.focus();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-semibold transition-all shadow-glow-cyan"
                  >
                    Create your first rule
                  </button>
                </div>
              )
            )}

            {/* Tab 2 Content: Violation History */}
            {tab === "history" && (
              <div className="overflow-y-auto max-h-[260px]">
                {violations.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    No violations recorded
                  </div>
                ) : (
                  <div className="divide-y divide-white/4">
                    {violations.map((v) => (
                      <div key={v.id} className="py-2.5 px-3 flex items-center justify-between text-xs hover:bg-white/2 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ruleTypeBadge[v.rule_type as RuleType] ?? "bg-white/5 text-muted-foreground"}`}>
                            {RULE_META[v.rule_type as RuleType]?.label ?? v.rule_type}
                          </span>
                          <span className={v.action_taken === "order_rejected" ? "text-rose-400 font-semibold" : "text-amber-400 font-semibold"}>
                            {v.action_taken === "order_rejected" ? "🚫 Blocked" : "🔔 Alerted"}
                          </span>
                        </div>
                        <span className="text-muted-foreground text-[11px]">{new Date(v.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lower Panel: Popular Rule Templates Grid */}
          <div className="surface-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Popular Rule Templates</h3>
              <button className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">
                View all templates
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Template 1: Max Daily Loss */}
              <div className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-rose-500/30 transition-all space-y-2 flex flex-col justify-between group cursor-pointer">
                <div className="space-y-1.5">
                  <div className="w-6 h-6 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-rose-400 transition-colors">Max Daily Loss</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Block if daily realized PnL goes below limit</p>
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">Popular</span>
                </div>
              </div>

              {/* Template 2: Max Position Size */}
              <div className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-amber-500/30 transition-all space-y-2 flex flex-col justify-between group cursor-pointer">
                <div className="space-y-1.5">
                  <div className="w-6 h-6 rounded-md bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  </div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-amber-400 transition-colors">Max Position Size</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Limit individual position size in USDT</p>
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Popular</span>
                </div>
              </div>

              {/* Template 3: Max Leverage */}
              <div className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-purple-500/30 transition-all space-y-2 flex flex-col justify-between group cursor-pointer">
                <div className="space-y-1.5">
                  <div className="w-6 h-6 rounded-md bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-purple-400 transition-colors">Max Leverage</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Prevent orders above set leverage</p>
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">Popular</span>
                </div>
              </div>

              {/* Template 4: Max Drawdown */}
              <div className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-blue-500/30 transition-all space-y-2 flex flex-col justify-between group cursor-pointer">
                <div className="space-y-1.5">
                  <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                      <polyline points="17 18 23 18 23 12" />
                    </svg>
                  </div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-blue-400 transition-colors">Max Drawdown</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Protect from large account drawdown</p>
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">Popular</span>
                </div>
              </div>

              {/* Template 5: Consecutive Loss */}
              <div className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-emerald-500/30 transition-all space-y-2 flex flex-col justify-between group cursor-pointer">
                <div className="space-y-1.5">
                  <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <p className="font-semibold text-xs text-foreground group-hover:text-emerald-400 transition-colors">Consecutive Loss</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">Block after N consecutive losing trades</p>
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Popular</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Protection Banner ────────────────────────────── */}
      <div className="surface-card p-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.02] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 shadow-glow-cyan-sm mt-0.5">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-sm text-cyan-400">Protection that works for you</h4>
            <p className="text-xs text-muted-foreground max-w-xl leading-relaxed">
              Risk rules are evaluated in real-time before every order is placed. If a rule is violated, the order will be blocked or an alert will be sent based on your action.
            </p>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 shrink-0 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-white/6">
          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-cyan-400 shrink-0">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <div>
              <p className="font-semibold text-xs text-foreground">Real-time evaluation</p>
              <p className="text-[10px] text-muted-foreground">Checked before every order</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-cyan-400 shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <div>
              <p className="font-semibold text-xs text-foreground">Secure & private</p>
              <p className="text-[10px] text-muted-foreground">Your rules stay encrypted</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-cyan-400 shrink-0">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <div>
              <p className="font-semibold text-xs text-foreground">You're in control</p>
              <p className="text-[10px] text-muted-foreground">Customize rules to match your strategy</p>
            </div>
          </div>
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
