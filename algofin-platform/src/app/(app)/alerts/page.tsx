"use client";
// src/app/(app)/alerts/page.tsx
// AlgoFin v2 — Phase E: Telegram Alerts configuration page

import { useEffect, useState } from "react";
import api from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────
type TelegramConfig = {
  id: string;
  chat_id: string;
  bot_token_masked: string;
  is_active: boolean;
  created_at: string;
};

type AlertRule = {
  id: string;
  alert_type: string;
  symbol: string | null;
  threshold: string | null;
  direction: string | null;
  is_active: boolean;
  triggered_count: number;
  last_triggered_at: string | null;
  created_at: string;
};

type Delivery = {
  id: string;
  event_type: string;
  message: string;
  success: boolean;
  error: string | null;
  sent_at: string;
};

// ── Constants ──────────────────────────────────────────────────────────────
const ALERT_TYPES = [
  { value: "ORDER_FILLED",    label: "Order Filled",    desc: "When an order is fully executed" },
  { value: "ORDER_CANCELLED", label: "Order Cancelled", desc: "When an order is cancelled" },
  { value: "ORDER_REJECTED",  label: "Order Rejected",  desc: "When exchange rejects an order" },
  { value: "RISK_TRIGGERED",  label: "Risk Triggered",  desc: "When a risk rule fires" },
  { value: "PRICE_ALERT",     label: "Price Alert",     desc: "When price crosses a threshold" },
];

const EVENT_COLORS: Record<string, string> = {
  ORDER_FILLED:    "text-emerald-400",
  ORDER_CANCELLED: "text-amber-400",
  ORDER_REJECTED:  "text-rose-400",
  RISK_TRIGGERED:  "text-orange-400",
  PRICE_ALERT:     "text-cyan-400",
};

// ── Section wrapper ────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-1 border border-white/8 rounded-2xl p-6 space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AlertsPage() {
  // Telegram config
  const [tgConfig, setTgConfig]   = useState<TelegramConfig | null>(null);
  const [botToken, setBotToken]   = useState("");
  const [chatId, setChatId]       = useState("");
  const [tgLoading, setTgLoading] = useState(false);
  const [tgError, setTgError]     = useState<string | null>(null);
  const [tgSuccess, setTgSuccess] = useState(false);

  // Alert rules
  const [rules, setRules]         = useState<AlertRule[]>([]);
  const [newType, setNewType]     = useState("ORDER_FILLED");
  const [newSymbol, setNewSymbol] = useState("");
  const [newThreshold, setNewThreshold] = useState("");
  const [newDirection, setNewDirection] = useState<"above" | "below">("above");
  const [rulesLoading, setRulesLoading] = useState(false);

  // Delivery history
  const [history, setHistory]     = useState<Delivery[]>([]);
  const [activeTab, setActiveTab] = useState<"config" | "rules" | "history">("config");

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadTelegramConfig();
    loadRules();
    loadHistory();
  }, []);

  async function loadTelegramConfig() {
    try {
      const res = await api.get<{ success: boolean; data: TelegramConfig | null }>("/alerts/telegram");
      setTgConfig(res.data.data);
    } catch { /* not configured */ }
  }

  async function loadRules() {
    try {
      const res = await api.get<{ success: boolean; data: AlertRule[] }>("/alerts/rules");
      setRules(res.data.data);
    } catch { /* ignore */ }
  }

  async function loadHistory() {
    try {
      const res = await api.get<{ success: boolean; data: Delivery[] }>("/alerts/history?limit=20");
      setHistory(res.data.data);
    } catch { /* ignore */ }
  }

  // ── Telegram config handlers ─────────────────────────────────────────────
  async function handleSaveTelegram(e: React.FormEvent) {
    e.preventDefault();
    if (!botToken.trim() || !chatId.trim()) return;
    setTgLoading(true);
    setTgError(null);
    setTgSuccess(false);
    try {
      const res = await api.put<{ success: boolean; data: TelegramConfig }>(
        "/alerts/telegram",
        { bot_token: botToken.trim(), chat_id: chatId.trim() }
      );
      setTgConfig(res.data.data);
      setTgSuccess(true);
      setBotToken("");
    } catch (err: any) {
      setTgError(err?.response?.data?.detail || "Failed to connect Telegram");
    } finally {
      setTgLoading(false);
    }
  }

  async function handleDeleteTelegram() {
    if (!confirm("Disconnect Telegram? All alert rules will stop delivering.")) return;
    await api.delete("/alerts/telegram");
    setTgConfig(null);
    setTgSuccess(false);
  }

  // ── Rule handlers ────────────────────────────────────────────────────────
  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    setRulesLoading(true);
    try {
      const body: any = { alert_type: newType };
      if (newType === "PRICE_ALERT") {
        body.symbol    = newSymbol.toUpperCase();
        body.threshold = parseFloat(newThreshold);
        body.direction = newDirection;
      }
      await api.post("/alerts/rules", body);
      await loadRules();
      setNewSymbol("");
      setNewThreshold("");
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to create rule");
    } finally {
      setRulesLoading(false);
    }
  }

  async function handleToggleRule(id: string) {
    await api.patch(`/alerts/rules/${id}`);
    await loadRules();
  }

  async function handleDeleteRule(id: string) {
    await api.delete(`/alerts/rules/${id}`);
    await loadRules();
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const tabs = [
    { id: "config",  label: "Telegram Setup" },
    { id: "rules",   label: `Rules (${rules.length})` },
    { id: "history", label: "History" },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Get notified on Telegram when orders fill, risks trigger, or prices cross your thresholds.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-surface-1 rounded-xl border border-white/8 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.id
                ? "bg-primary text-primary-foreground shadow"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Telegram Setup ─────────────────────────────────────────── */}
      {activeTab === "config" && (
        <div className="space-y-4">
          {/* Setup instructions */}
          <div className="bg-surface-1 border border-white/8 rounded-2xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-foreground">How to connect Telegram</h2>
            <ol className="space-y-2 text-sm text-muted-foreground list-none">
              {[
                <>Open Telegram and message <code className="text-primary bg-primary/10 px-1 rounded">@BotFather</code></>,
                <>Send <code className="text-primary bg-primary/10 px-1 rounded">/newbot</code> and follow instructions to create your bot. Copy the <strong className="text-foreground">Bot Token</strong>.</>,
                <>Start a chat with your new bot (send it any message).</>,
                <>Open this URL in your browser to get your Chat ID:<br/>
                  <code className="text-xs text-cyan-400 break-all">https://api.telegram.org/bot&#123;YOUR_TOKEN&#125;/getUpdates</code><br/>
                  Look for <code className="text-primary bg-primary/10 px-1 rounded">"id"</code> inside <code className="text-primary bg-primary/10 px-1 rounded">chat</code>.
                </>,
                <>Paste both below — we&apos;ll send a test message to confirm.</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Current config status */}
          {tgConfig && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-400">Telegram connected</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Token: {tgConfig.bot_token_masked} &nbsp;|&nbsp; Chat ID: {tgConfig.chat_id}
                </p>
              </div>
              <button
                onClick={handleDeleteTelegram}
                className="text-xs text-rose-400 hover:text-rose-300 border border-rose-400/30 px-3 py-1 rounded-lg transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}

          {/* Config form */}
          <Section title={tgConfig ? "Update connection" : "Connect Telegram"}>
            <form onSubmit={handleSaveTelegram} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Bot Token</label>
                <input
                  type="password"
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Chat ID</label>
                <input
                  type="text"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="-100123456789 or 123456789"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                />
              </div>

              {tgError && (
                <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2">
                  {tgError}
                </p>
              )}
              {tgSuccess && (
                <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2">
                  Telegram connected! Check your bot for a confirmation message.
                </p>
              )}

              <button
                type="submit"
                disabled={tgLoading || !botToken.trim() || !chatId.trim()}
                className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
                  hover:bg-primary/90 active:scale-[0.98] transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tgLoading ? "Connecting…" : "Connect & Send Test Message"}
              </button>
            </form>
          </Section>
        </div>
      )}

      {/* ── Tab: Alert Rules ────────────────────────────────────────────── */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          {!tgConfig && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-400">
              Connect Telegram first before adding alert rules.
            </div>
          )}

          {/* Add rule form */}
          <Section title="Add alert rule">
            <form onSubmit={handleAddRule} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Alert Type</label>
                  <select
                    value={newType}
                    onChange={e => setNewType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  >
                    {ALERT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* PRICE_ALERT extra fields */}
              {newType === "PRICE_ALERT" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Symbol</label>
                    <input
                      type="text"
                      value={newSymbol}
                      onChange={e => setNewSymbol(e.target.value)}
                      placeholder="BTCUSDT"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Price Threshold ($)</label>
                    <input
                      type="number"
                      value={newThreshold}
                      onChange={e => setNewThreshold(e.target.value)}
                      placeholder="100000"
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Direction</label>
                    <select
                      value={newDirection}
                      onChange={e => setNewDirection(e.target.value as "above" | "below")}
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-background border border-white/8 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                    >
                      <option value="above">Above threshold</option>
                      <option value="below">Below threshold</option>
                    </select>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={rulesLoading || !tgConfig}
                className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm
                  hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rulesLoading ? "Adding…" : "Add Rule"}
              </button>
            </form>
          </Section>

          {/* Rules list */}
          <Section title={`Active rules (${rules.length})`}>
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No rules yet. Add one above.
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                      rule.is_active
                        ? "bg-background border-white/8"
                        : "bg-background/40 border-white/4 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className={`text-sm font-medium ${EVENT_COLORS[rule.alert_type] || "text-foreground"}`}>
                        {rule.alert_type}
                      </span>
                      {rule.alert_type === "PRICE_ALERT" && (
                        <span className="text-xs text-muted-foreground">
                          {rule.symbol} {rule.direction} ${Number(rule.threshold).toLocaleString()}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        Triggered: {rule.triggered_count}×
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleRule(rule.id)}
                        className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                          rule.is_active
                            ? "border-primary/30 text-primary hover:bg-primary/10"
                            : "border-white/10 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {rule.is_active ? "Active" : "Paused"}
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="text-xs px-3 py-1 rounded-lg border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── Tab: History ────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <Section title="Delivery history (last 20)">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No alerts sent yet.
            </p>
          ) : (
            <div className="space-y-2">
              {history.map(d => (
                <div
                  key={d.id}
                  className="flex items-start gap-4 p-4 bg-background border border-white/8 rounded-xl"
                >
                  <span className={`text-xs font-mono mt-0.5 ${d.success ? "text-emerald-400" : "text-rose-400"}`}>
                    {d.success ? "OK" : "FAIL"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${EVENT_COLORS[d.event_type] || "text-foreground"}`}>
                        {d.event_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(d.sent_at).toLocaleString()}
                      </span>
                    </div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans line-clamp-3">
                      {d.message}
                    </pre>
                    {d.error && (
                      <p className="text-xs text-rose-400 mt-1">{d.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
