"use client";
// src/app/(app)/risk/page.tsx
// AlgoFin v2 — Risk Controls (matching reference UI)

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { cachedGet, invalidateCachePrefix } from "@/lib/apiCache";
import marketDataSocket from "@/lib/marketDataSocket";
import { useAuthStore } from "@/stores/auth.store";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// ── Types ─────────────────────────────────────────────────────────────────────
type RuleType = "MAX_DAILY_LOSS" | "MAX_POSITION_SIZE" | "MAX_LEVERAGE" | "MAX_DRAWDOWN" | "CONSECUTIVE_LOSS";
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
  MAX_LEVERAGE: {
    label:       "Max Leverage",
    unit:        "x",
    description: "Prevent orders above set leverage",
  },
  MAX_DRAWDOWN: {
    label:       "Max Drawdown",
    unit:        "%",
    description: "Protect from large account drawdown",
  },
  CONSECUTIVE_LOSS: {
    label:       "Consecutive Loss",
    unit:        "trades",
    description: "Block after N consecutive losing trades",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: string | number) => Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });

const actionBadge = (action: RuleAction) =>
  action === "reject"
    ? "bg-rose-500/15 text-rose-400 border-rose-500/20"
    : "bg-amber-500/15 text-amber-400 border-amber-500/20";

const ruleTypeBadge: Record<RuleType, string> = {
  MAX_DAILY_LOSS:     "bg-rose-500/10 text-rose-400",
  MAX_POSITION_SIZE:  "bg-amber-500/10 text-amber-400",
  MAX_LEVERAGE:       "bg-purple-500/10 text-purple-400",
  MAX_DRAWDOWN:       "bg-cyan-500/10 text-cyan-400",
  CONSECUTIVE_LOSS:   "bg-emerald-500/10 text-emerald-400",
};

// ── Custom Rule Type Dropdown Component ───────────────────────────────────────
const RULE_TYPE_OPTIONS: { type: RuleType; label: string; icon: React.ReactNode; colorCls: string }[] = [
  {
    type: "MAX_DAILY_LOSS",
    label: "Max Daily Loss",
    colorCls: "bg-rose-500/20 border-rose-500/30 text-rose-400",
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    ),
  },
  {
    type: "MAX_POSITION_SIZE",
    label: "Max Position Size",
    colorCls: "bg-amber-500/20 border-amber-500/30 text-amber-400",
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    type: "MAX_LEVERAGE",
    label: "Max Leverage",
    colorCls: "bg-purple-500/20 border-purple-500/30 text-purple-400",
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
        <path d="M12 12l4-4" />
      </svg>
    ),
  },
  {
    type: "MAX_DRAWDOWN",
    label: "Max Drawdown",
    colorCls: "bg-blue-500/20 border-blue-500/30 text-blue-400",
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    type: "CONSECUTIVE_LOSS",
    label: "Consecutive Loss",
    colorCls: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
    icon: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
      </svg>
    ),
  },
];

function CustomRuleTypeSelect({
  value,
  onChange,
}: {
  value: RuleType;
  onChange: (val: RuleType) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = RULE_TYPE_OPTIONS.find((o) => o.type === value) ?? RULE_TYPE_OPTIONS[0];

  return (
    <div className="relative">
      {/* Trigger Box */}
      <button
        type="button"
        id="risk-rule-type-trigger"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-3 py-1.5 rounded-lg bg-[#080e12] border border-cyan-500/40 text-xs font-semibold text-foreground flex items-center justify-between hover:border-cyan-400 transition-colors shadow-sm"
      >
        <span>{selected.label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-foreground/80 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown Menu Popup */}
      {open && (
        <>
          {/* Backdrop click listener */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          <div className="absolute left-0 right-0 top-full mt-1 z-40 bg-[#0c141a] border border-white/10 rounded-xl p-1 shadow-2xl space-y-0.5 animate-fade-in">
            {RULE_TYPE_OPTIONS.map((opt) => {
              const isSelected = opt.type === value;
              return (
                <div
                  key={opt.type}
                  onClick={() => {
                    onChange(opt.type);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? "bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
                      : "hover:bg-white/5 text-foreground border border-transparent"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${opt.colorCls}`}
                  >
                    {opt.icon}
                  </div>
                  <span className={`text-[11px] font-semibold ${isSelected ? "text-cyan-400" : "text-foreground"}`}>
                    {opt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Create Rule Form Component ────────────────────────────────────────────────
function CreateRuleForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName]           = useState("");
  const [ruleType, setRuleType]   = useState<RuleType>("MAX_DAILY_LOSS");
  const [threshold, setThreshold] = useState("500");
  const [action, setAction]       = useState<RuleAction>("reject");
  const [symbol, setSymbol]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);

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
      invalidateCachePrefix("/risk");
      setName("");
      setThreshold("500");
      setSymbol("");
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Failed to create rule");
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan-500/50 transition-colors";
  const labelCls = "block text-xs font-semibold text-foreground mb-1.5";
  const meta = RULE_META[ruleType];

  return (
    <div className="surface-card p-6 space-y-5">
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
            required
            className={inputCls}
          />
        </div>

        {/* Rule Type */}
        <div>
          <label className={labelCls}>Rule Type</label>
          <CustomRuleTypeSelect value={ruleType} onChange={setRuleType} />
          <p className="mt-1.5 text-[11px] text-muted-foreground/80 leading-relaxed">
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
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              id="risk-action-reject"
              onClick={() => setAction("reject")}
              className={`py-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-2 ${
                action === "reject"
                  ? "bg-rose-950/40 border-rose-600/40 text-rose-400 shadow-inner"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-rose-500/20 flex items-center justify-center text-[10px]">🚫</span>
              Block Order
            </button>
            <button
              type="button"
              id="risk-action-alert"
              onClick={() => setAction("alert")}
              className={`py-2.5 rounded-xl text-xs font-semibold border transition-all flex items-center justify-center gap-2 ${
                action === "alert"
                  ? "bg-amber-950/40 border-amber-500/40 text-amber-400 shadow-inner"
                  : "bg-white/5 border-white/10 text-amber-400/70 hover:border-amber-500/30"
              }`}
            >
              <span className="text-sm">🔔</span>
              Alert Only
            </button>
          </div>
        </div>

        {/* Symbol */}
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <label className="text-xs font-semibold text-foreground">Symbol (optional)</label>
            <span className="text-muted-foreground text-[10px]" title="Leave blank for global rules">ⓘ</span>
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
          className="w-full py-2.5 rounded-xl text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-black shadow-glow-cyan transition-all disabled:opacity-50 mt-2"
        >
          {submitting ? "Creating…" : "Create Rule"}
        </button>
      </form>
    </div>
  );
}

// ── Rule Card Component ───────────────────────────────────────────────────────
function RuleCard({
  rule,
  onToggle,
  onDelete,
}: {
  rule:     RiskRule;
  onToggle: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const meta = RULE_META[rule.rule_type] ?? RULE_META.MAX_DAILY_LOSS;

  return (
    <div className={`surface-card p-4 border transition-all ${
      rule.is_active ? "border-white/8" : "border-white/4 opacity-60"
    }`}>
      <div className="flex items-start justify-between gap-3 mb-2">
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
          <p className="text-xs font-semibold text-foreground truncate">{rule.name}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            id={`rule-toggle-${rule.id}`}
            onClick={() => onToggle(rule.id, !rule.is_active)}
            title={rule.is_active ? "Disable rule" : "Enable rule"}
            className={`w-8 h-4.5 rounded-full border transition-all relative ${
              rule.is_active
                ? "bg-cyan-500/30 border-cyan-500/50"
                : "bg-white/10 border-white/20"
            }`}
          >
            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
              rule.is_active ? "left-3.5 bg-cyan-400" : "left-0.5 bg-muted-foreground"
            }`} />
          </button>
          <button
            id={`rule-delete-${rule.id}`}
            onClick={() => onDelete(rule.id)}
            className="p-1 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-all"
            title="Delete rule"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          Limit: <span className="text-foreground font-medium">{fmt(rule.threshold)} {meta.unit}</span>
        </span>
        {rule.triggered_count > 0 ? (
          <span className="text-rose-400">⚡ Triggered {rule.triggered_count}×</span>
        ) : (
          <span className="text-emerald-400/80">Active protection</span>
        )}
      </div>
    </div>
  );
}

// ── Alert Toast Component ─────────────────────────────────────────────────────
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
          <p className="text-xs font-semibold text-rose-400 mb-0.5">Risk Rule Triggered</p>
          <p className="text-xs font-medium text-foreground">{alert.ruleName}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {alert.ruleType}: <span className="text-rose-400 font-semibold">{fmt(alert.currentValue)}</span> / {fmt(alert.threshold)}
          </p>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground text-xs shrink-0">✕</button>
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function RiskPage() {
  const [rules, setRules]           = useState<RiskRule[]>([]);
  const [violations, setViolations] = useState<RiskViolation[]>([]);
  const [loading, setLoading]       = useState(true);
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
    marketDataSocket.connect(accessToken);
  }, [accessToken]);

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
        <Link
          href="/journal"
          className="px-3.5 py-1.5 rounded-xl border border-white/6 bg-white/[0.02] text-xs font-semibold text-foreground hover:text-cyan-400 transition-colors flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          How it works
        </Link>
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
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
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
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
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

      {/* ── Main 2-Column Section ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Form (~35% width) */}
        <div className="lg:col-span-4">
          <CreateRuleForm onSuccess={fetchRules} />
        </div>

        {/* Right Section (~65% width) */}
        <div className="lg:col-span-8 space-y-5 flex flex-col justify-between">
          {/* Top Rules List Card */}
          <div className="surface-card p-6 space-y-5 flex-1 min-h-[300px] flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-white/6 pb-3">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setTab("rules")}
                  className={`text-xs font-semibold pb-1 relative transition-colors ${
                    tab === "rules" ? "text-cyan-400" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Rules
                  {tab === "rules" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />}
                </button>
                <button
                  onClick={() => { setTab("history"); fetchViolations(); }}
                  className={`text-xs font-semibold pb-1 relative transition-colors ${
                    tab === "history" ? "text-cyan-400" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Violation History
                  {tab === "history" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />}
                </button>
              </div>

              <button
                onClick={() => setTab("rules")}
                className="px-3 py-1.5 rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 text-xs font-semibold hover:bg-cyan-500/20 transition-colors"
              >
                Manage Rules
              </button>
            </div>

            {/* Tab content */}
            {tab === "rules" ? (
              showSkeleton ? (
                <div className="space-y-3 py-4">
                  {[1, 2].map((i) => <div key={i} className="skeleton h-16 w-full" />)}
                </div>
              ) : rules.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="M9 12l2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground">No risk rules yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Create a rule to automatically protect your account</p>
                  </div>
                  <button
                    onClick={() => {
                      const el = document.getElementById("risk-rule-name");
                      el?.focus();
                    }}
                    className="px-5 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black text-xs font-semibold shadow-glow-cyan transition-all"
                  >
                    Create your first rule
                  </button>
                </div>
              ) : (
                <div className="space-y-3 py-2">
                  {rules.map((r) => (
                    <RuleCard key={r.id} rule={r} onToggle={handleToggle} onDelete={handleDelete} />
                  ))}
                </div>
              )
            ) : (
              <div className="py-2">
                {violations.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    No violations recorded yet. Your account is operating within all safety parameters.
                  </div>
                ) : (
                  <div className="divide-y divide-white/6">
                    {violations.map((v) => (
                      <div key={v.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-rose-400">{v.rule_type}</span>
                          <span className="text-muted-foreground">Value: {fmt(v.current_value)} / {fmt(v.threshold)}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{new Date(v.occurred_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Popular Rule Templates Card */}
          <div className="surface-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-foreground">Popular Rule Templates</h3>
              <button
                onClick={() => {
                  const el = document.getElementById("risk-rule-name");
                  el?.focus();
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold transition-colors"
              >
                View all templates
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Template 1: Max Daily Loss */}
              <div
                onClick={() => {
                  const el = document.getElementById("risk-rule-type") as HTMLSelectElement;
                  if (el) { el.value = "MAX_DAILY_LOSS"; setRules([...rules]); }
                }}
                className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all space-y-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                </div>
                <p className="font-semibold text-[11px] text-foreground group-hover:text-rose-400 transition-colors">Max Daily Loss</p>
                <p className="text-[10px] text-muted-foreground leading-snug">Block if daily realized PnL goes below limit</p>
                <span className="inline-block text-[9px] font-semibold text-rose-400">Popular</span>
              </div>

              {/* Template 2: Max Position Size */}
              <div
                onClick={() => {
                  const el = document.getElementById("risk-rule-type") as HTMLSelectElement;
                  if (el) { el.value = "MAX_POSITION_SIZE"; }
                }}
                className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all space-y-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
                </div>
                <p className="font-semibold text-[11px] text-foreground group-hover:text-amber-400 transition-colors">Max Position Size</p>
                <p className="text-[10px] text-muted-foreground leading-snug">Limit individual position size in USDT</p>
                <span className="inline-block text-[9px] font-semibold text-amber-400">Popular</span>
              </div>

              {/* Template 3: Max Leverage */}
              <div
                onClick={() => {
                  const el = document.getElementById("risk-rule-type") as HTMLSelectElement;
                  if (el) { el.value = "MAX_LEVERAGE"; }
                }}
                className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all space-y-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                </div>
                <p className="font-semibold text-[11px] text-foreground group-hover:text-purple-400 transition-colors">Max Leverage</p>
                <p className="text-[10px] text-muted-foreground leading-snug">Prevent orders above set leverage</p>
                <span className="inline-block text-[9px] font-semibold text-purple-400">Popular</span>
              </div>

              {/* Template 4: Max Drawdown */}
              <div
                onClick={() => {
                  const el = document.getElementById("risk-rule-type") as HTMLSelectElement;
                  if (el) { el.value = "MAX_DRAWDOWN"; }
                }}
                className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all space-y-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg>
                </div>
                <p className="font-semibold text-[11px] text-foreground group-hover:text-cyan-400 transition-colors">Max Drawdown</p>
                <p className="text-[10px] text-muted-foreground leading-snug">Protect from large account drawdown</p>
                <span className="inline-block text-[9px] font-semibold text-cyan-400">Popular</span>
              </div>

              {/* Template 5: Consecutive Loss */}
              <div
                onClick={() => {
                  const el = document.getElementById("risk-rule-type") as HTMLSelectElement;
                  if (el) { el.value = "CONSECUTIVE_LOSS"; }
                }}
                className="p-3 rounded-xl border border-white/6 bg-white/[0.01] hover:border-white/12 transition-all space-y-2 cursor-pointer group"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                </div>
                <p className="font-semibold text-[11px] text-foreground group-hover:text-emerald-400 transition-colors">Consecutive Loss</p>
                <p className="text-[10px] text-muted-foreground leading-snug">Block after N consecutive losing trades</p>
                <span className="inline-block text-[9px] font-semibold text-emerald-400">Popular</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Feature Banner ─────────────────────────────────── */}
      <div className="surface-card p-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.02] flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        {/* Left Hero side */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-emerald-400">Protection that works for you</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl leading-relaxed">
              Risk rules are evaluated in real-time before every order is placed. If a rule is violated, the order will be blocked or an alert will be sent based on your action.
            </p>
          </div>
        </div>

        {/* Right 3 Features side */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:border-l lg:border-white/6 lg:pl-8 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div>
              <p className="font-semibold text-xs text-foreground">Real-time evaluation</p>
              <p className="text-[11px] text-muted-foreground">Checked before every order</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </div>
            <div>
              <p className="font-semibold text-xs text-foreground">Secure & private</p>
              <p className="text-[11px] text-muted-foreground">Your rules stay encrypted</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
            </div>
            <div>
              <p className="font-semibold text-xs text-foreground">You're in control</p>
              <p className="text-[11px] text-muted-foreground">Customize rules to match your strategy</p>
            </div>
          </div>
        </div>
      </div>

      {/* Live alert toast */}
      {activeAlert && (
        <AlertToast alert={activeAlert} onDismiss={() => setActiveAlert(null)} />
      )}
    </div>
  );
}
