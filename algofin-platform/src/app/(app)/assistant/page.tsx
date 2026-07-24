"use client";
// src/app/(app)/assistant/page.tsx
// AlgoFin — AI Assistant (matching reference mockup UI)

import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id:        string;
  role:      "user" | "assistant" | "tool";
  content:   string;
  tool_name?: string;
  streaming?: boolean;
  time?:      string;
  tool_call?: { tool: string; status: "running" | "done" };
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const GeminiIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gem-grad-asst" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4ECDC4" />
        <stop offset="100%" stopColor="#06B6D4" />
      </linearGradient>
    </defs>
    <path d="M12 2C6.5 8.5 6.5 15.5 12 22C17.5 15.5 17.5 8.5 12 2Z" fill="url(#gem-grad-asst)" />
    <path d="M2 12C8.5 6.5 15.5 6.5 22 12C15.5 17.5 8.5 17.5 2 12Z" fill="url(#gem-grad-asst)" opacity={0.6} />
  </svg>
);

const UserAvatar = () => (
  <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  </div>
);

// ── Robot Avatar Graphic Component ───────────────────────────────────────────
const RobotAvatar = () => (
  <div className="w-10 h-10 rounded-2xl bg-gradient-to-b from-slate-900 to-cyan-950 border border-cyan-400/40 shadow-glow-cyan flex items-center justify-center p-1.5 shrink-0">
    <div className="w-full h-full rounded-xl bg-black/80 border border-cyan-500/30 flex items-center justify-center gap-1.5">
      <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
      <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
    </div>
  </div>
);

// ── Markdown Renderer ─────────────────────────────────────────────────────────
function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return <p key={i} className="font-semibold text-foreground mt-3 first:mt-0">{line.slice(3)}</p>;
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.slice(2);
          return (
            <div key={i} className="flex gap-2">
              <span className="text-cyan-400 mt-1 shrink-0">·</span>
              <span>{renderInline(content)}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\$[\d,]+\.?\d*\s*USDT)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return <code key={i} className="px-1 py-0.5 rounded bg-white/5 font-mono text-[11px] text-cyan-400">{part.slice(1, -1)}</code>;
    if (/^\$[\d,]+/.test(part))
      return <span key={i} className="text-emerald-400 font-medium">{part}</span>;
    return <span key={i}>{part}</span>;
  });
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function AssistantPage() {
  const [messages, setMessages]           = useState<Message[]>([]);
  const [input, setInput]                 = useState("");
  const [streaming, setStreaming]         = useState(false);
  const [, setThreadId]                   = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [quotaError, setQuotaError]       = useState<string | null>(null);
  const [tipIndex, setTipIndex]           = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  const tips = [
    "Use risk controls to protect your capital before entering any position.",
    "Monitor economic events to avoid unexpected market volatility.",
    "Review your daily PnL breakdown to optimize trading win rate.",
  ];

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load thread history on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<{
          data: { thread_id: string; messages: Array<{
            id: string; role: string; content: string; tool_name?: string; created_at: string;
          }> };
        }>("/assistant/thread");
        setThreadId(res.data.data.thread_id);
        const loaded = res.data.data.messages.map((m) => ({
          id:        m.id,
          role:      m.role as Message["role"],
          content:   m.content,
          tool_name: m.tool_name,
          time:      new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
        setMessages(loaded);
      } catch { /* no history yet */ }
      finally { setLoadingHistory(false); }
    };
    load();
  }, []);

  const addMessage = (msg: Partial<Message> & { role: Message["role"]; content: string }) => {
    const id = Math.random().toString(36).slice(2);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const full: Message = { id, streaming: false, time: nowTime, ...msg };
    setMessages((prev) => [...prev, full]);
    return id;
  };

  const updateMessage = (id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, ...updates } : m));
  };

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    setStreaming(true);
    const userText = text.trim();
    setInput("");
    inputRef.current?.focus();

    addMessage({ role: "user", content: userText });
    const assistantId = addMessage({ role: "assistant", content: "", streaming: true });

    try {
      const token = (() => {
        try {
          const raw = localStorage.getItem("algofin-auth");
          if (!raw) return null;
          return (JSON.parse(raw) as { state?: { accessToken?: string } })?.state?.accessToken ?? null;
        } catch { return null; }
      })();

      abortRef.current = new AbortController();
      const res = await fetch("/api/v1/assistant/message", {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:   JSON.stringify({ message: userText, stream: true }),
        signal: abortRef.current.signal,
        credentials: "include",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let   fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const payload = line.slice(6);
          if (payload === "[DONE]") { setStreaming(false); break; }

          try {
            const event = JSON.parse(payload) as {
              type: string;
              content?: string;
              tool?: string;
              message?: string;
            };

            if (event.type === "chunk" && event.content) {
              fullText += event.content;
              updateMessage(assistantId, { content: fullText, streaming: true });
            }

            if (event.type === "tool_call") {
              addMessage({ role: "tool", content: "", tool_name: event.tool });
              updateMessage(assistantId, {
                tool_call: { tool: event.tool!, status: "running" },
              });
            }

            if (event.type === "tool_result") {
              updateMessage(assistantId, { tool_call: undefined });
            }

            if (event.type === "done") {
              updateMessage(assistantId, { streaming: false });
            }

            if (event.type === "error") {
              const errMsg = event.message ?? "Unknown error";
              if (errMsg.includes("GEMINI_API_KEY") || errMsg.includes("not configured")) {
                setApiKeyMissing(true);
              } else if (errMsg.includes("quota") || errMsg.includes("429")) {
                setQuotaError(errMsg);
              }
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            }
          } catch { /* skip */ }
        }
      }

      updateMessage(assistantId, { streaming: false });
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (errorObj.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
      } else {
        const isBackendDown = errorObj.message?.includes("Failed to fetch") || errorObj.message?.includes("NetworkError");
        updateMessage(assistantId, {
          content: isBackendDown
            ? "⚠ Cannot reach the backend. Make sure the FastAPI server is running."
            : `⚠ ${errorObj.message ?? "Unknown error"}`,
          streaming: false,
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleReset = async () => {
    if (!confirm("Clear your conversation history?")) return;
    try { await api.delete("/assistant/thread"); } catch { /* ignore */ }
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] max-w-7xl mx-auto overflow-hidden gap-3 pb-1">
      {/* ── Header Row ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-foreground">AI Assistant</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
              <GeminiIcon />
              Powered by Gemini Flash
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your intelligent trading assistant for multi-exchange crypto trading
          </p>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="surface-card px-3.5 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 shrink-0"
        >
          <span>Clear conversation</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* Error Banners */}
      {apiKeyMissing && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 shrink-0">
          ⚠ Gemini API key invalid or missing. Update <code className="font-mono">GEMINI_API_KEY</code> in your backend.
        </div>
      )}
      {quotaError && (
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between shrink-0">
          <span>⚠ Gemini free-tier daily quota limit reached.</span>
          <button onClick={() => setQuotaError(null)} className="underline text-[11px]">Dismiss</button>
        </div>
      )}

      {/* ── 2-Column Split Grid Layout ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 overflow-hidden">
        {/* ── Left Column (~70% width): Chat & Inputs ────────────────────── */}
        <div className="lg:col-span-8 flex flex-col h-full overflow-hidden gap-3">
          {/* Top Hero Welcome Card */}
          <div className="surface-card p-4 rounded-2xl border border-white/8 flex items-center gap-4 relative overflow-hidden shrink-0">
            <RobotAvatar />
            <div className="space-y-0.5 max-w-xl">
              <h2 className="text-xs font-bold text-foreground">Hello! I'm your AlgoFin trading assistant.</h2>
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                I can help you monitor your portfolio, track your realized profit and loss (PnL), check your open positions, view recent trades, and keep an eye on upcoming high-impact events.
              </p>
              <p className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1 pt-0.5">
                <span>✈</span> How can I assist you today?
              </p>
            </div>
          </div>

          {/* Chat Feed Area (Flex-1 Internal Scrollbar) */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-4">
            <div className="text-center">
              <span className="text-[11px] text-muted-foreground/50 font-medium">Today</span>
            </div>

            {/* Default Mock Demo Messages if no history */}
            {messages.length === 0 && !loadingHistory && (
              <>
                {/* User Demo 1 */}
                <div className="flex flex-col items-end space-y-1">
                  <span className="text-[10px] text-muted-foreground/60 mr-11">02:35 PM</span>
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2.5 rounded-2xl rounded-tr-md bg-[#0e2a36] border border-cyan-500/30 text-xs text-foreground font-medium">
                      Show me my open positions
                    </div>
                    <UserAvatar />
                  </div>
                </div>

                {/* Assistant Demo 1 Rich Positions Table */}
                <div className="flex gap-3">
                  <RobotAvatar />
                  <div className="space-y-2.5 max-w-2xl flex-1">
                    <span className="text-[10px] text-muted-foreground/60">02:35 PM</span>
                    <p className="text-xs text-foreground font-medium">
                      You have 2 open positions across your connected exchanges.
                    </p>

                    {/* Rich Positions Table Card */}
                    <div className="surface-card rounded-xl border border-white/10 overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/8 bg-white/[0.02] text-[10px] text-muted-foreground/70 uppercase tracking-wider font-semibold">
                            <th className="py-2.5 px-3">Symbol</th>
                            <th className="py-2.5 px-3">Side</th>
                            <th className="py-2.5 px-3">Size</th>
                            <th className="py-2.5 px-3">Entry Price</th>
                            <th className="py-2.5 px-3">Mark Price</th>
                            <th className="py-2.5 px-3">Unrealized PnL</th>
                            <th className="py-2.5 px-3">PnL %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                          <tr className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3 font-semibold text-foreground">BTCUSDT</td>
                            <td className="py-2.5 px-3"><span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-sans font-semibold">Long</span></td>
                            <td className="py-2.5 px-3 text-muted-foreground">0.045 BTC</td>
                            <td className="py-2.5 px-3 text-muted-foreground">67,890.50</td>
                            <td className="py-2.5 px-3 text-foreground">68,245.10</td>
                            <td className="py-2.5 px-3 text-emerald-400 font-semibold">+15.95 USDT</td>
                            <td className="py-2.5 px-3 text-emerald-400 font-semibold">+2.12%</td>
                          </tr>
                          <tr className="hover:bg-white/[0.02]">
                            <td className="py-2.5 px-3 font-semibold text-foreground">ETHUSDT</td>
                            <td className="py-2.5 px-3"><span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-sans font-semibold">Short</span></td>
                            <td className="py-2.5 px-3 text-muted-foreground">1.250 ETH</td>
                            <td className="py-2.5 px-3 text-muted-foreground">3,245.80</td>
                            <td className="py-2.5 px-3 text-foreground">3,198.60</td>
                            <td className="py-2.5 px-3 text-emerald-400 font-semibold">+58.75 USDT</td>
                            <td className="py-2.5 px-3 text-emerald-400 font-semibold">+1.45%</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* User Demo 2 */}
                <div className="flex flex-col items-end space-y-1">
                  <span className="text-[10px] text-muted-foreground/60 mr-11">02:36 PM</span>
                  <div className="flex items-center gap-3">
                    <div className="px-4 py-2.5 rounded-2xl rounded-tr-md bg-[#0e2a36] border border-cyan-500/30 text-xs text-foreground font-medium">
                      What's my realized PnL this month?
                    </div>
                    <UserAvatar />
                  </div>
                </div>

                {/* Assistant Demo 2 Rich Metric Breakdown Card */}
                <div className="flex gap-3">
                  <RobotAvatar />
                  <div className="space-y-3 max-w-xl flex-1">
                    <span className="text-[10px] text-muted-foreground/60">02:36 PM</span>
                    <p className="text-xs text-foreground font-medium">
                      Your realized PnL for July 2026 is <span className="text-emerald-400 font-bold">+142.68 USDT</span>.
                    </p>

                    {/* Rich PnL Metric Card */}
                    <div className="surface-card p-4 rounded-xl border border-white/10 grid grid-cols-4 gap-3 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Wins</p>
                        <p className="text-base font-bold text-emerald-400">8</p>
                      </div>
                      <div className="border-l border-white/8 pl-2">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Losses</p>
                        <p className="text-base font-bold text-rose-400">5</p>
                      </div>
                      <div className="border-l border-white/8 pl-2">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Win Rate</p>
                        <p className="text-base font-bold text-cyan-400">61.54%</p>
                      </div>
                      <div className="border-l border-white/8 pl-2">
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Profit Factor</p>
                        <p className="text-base font-bold text-purple-400">2.18</p>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">Want me to show the daily breakdown?</p>

                    {/* Follow-up Prompt Pills */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        onClick={() => sendMessage("Yes, show daily breakdown")}
                        className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/30 text-xs text-muted-foreground hover:text-foreground transition-all"
                      >
                        Yes, show daily
                      </button>
                      <button
                        onClick={() => sendMessage("Show chart")}
                        className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/30 text-xs text-muted-foreground hover:text-foreground transition-all"
                      >
                        Show chart
                      </button>
                      <button
                        onClick={() => sendMessage("Compare with last month")}
                        className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/30 text-xs text-muted-foreground hover:text-foreground transition-all"
                      >
                        Compare with last month
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Active Real User/Assistant Messages */}
            {messages.map((msg) => (
              <div key={msg.id}>
                {msg.role === "user" ? (
                  <div className="flex flex-col items-end space-y-1">
                    <span className="text-[10px] text-muted-foreground/60 mr-11">{msg.time || "Now"}</span>
                    <div className="flex items-center gap-3">
                      <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-[#0e2a36] border border-cyan-500/30 text-xs text-foreground leading-relaxed">
                        {msg.content}
                      </div>
                      <UserAvatar />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <RobotAvatar />
                    <div className="max-w-[85%] space-y-2">
                      <span className="text-[10px] text-muted-foreground/60">{msg.time || "Now"}</span>
                      {msg.content && (
                        <div className="text-xs text-foreground/90 leading-relaxed surface-card p-3 rounded-xl border border-white/8">
                          <RenderMarkdown text={msg.content} />
                          {msg.streaming && (
                            <span className="inline-block w-1.5 h-4 ml-0.5 bg-cyan-400/60 rounded-sm animate-pulse align-middle" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Bottom Chat Input Bar */}
          <div className="surface-card p-3 rounded-2xl border border-white/10 space-y-2 shrink-0">
            <div className="flex items-center gap-3">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about your trading..."
                rows={1}
                className="flex-1 bg-transparent px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none resize-none leading-relaxed"
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center hover:bg-rose-500/30 transition-all shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim()}
                  className="w-9 h-9 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-black flex items-center justify-center transition-all shadow-glow-cyan shrink-0 disabled:opacity-40 disabled:shadow-none"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="rotate-45">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground/40 text-center border-t border-white/5 pt-1.5">
              AI can make mistakes. Always verify important information.
            </div>
          </div>
        </div>

        {/* ── Right Sidebar Column (~30% width): Compact Summary Widgets ───── */}
        <div className="lg:col-span-4 h-full flex flex-col justify-between overflow-hidden space-y-2.5">
          {/* Widget 1: Portfolio Summary */}
          <div className="surface-card p-3 rounded-2xl border border-white/8 space-y-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-foreground">Portfolio Summary</h3>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors text-xs"
                title="Refresh portfolio"
              >
                🔄
              </button>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Total Balance</p>
                <p className="text-lg font-extrabold text-foreground tracking-tight">12,458.75 USDT</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">24H Change</p>
                <p className="text-[11px] font-bold text-emerald-400">+245.68 USDT (+2.01%)</p>
              </div>
            </div>
          </div>

          {/* Widget 2: Quick Access Links */}
          <div className="surface-card p-3 rounded-2xl border border-white/8 space-y-1.5 shrink-0">
            <h3 className="text-xs font-bold text-foreground">Quick Access</h3>
            <div className="space-y-1">
              <Link
                href="/dashboard"
                className="px-2.5 py-1.5 rounded-xl surface-card border border-white/5 hover:border-cyan-500/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Portfolio Overview
                  </span>
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>

              <Link
                href="/journal"
                className="px-2.5 py-1.5 rounded-xl surface-card border border-white/5 hover:border-cyan-500/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Profit & Loss (PnL)
                  </span>
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>

              <Link
                href="/orders"
                className="px-2.5 py-1.5 rounded-xl surface-card border border-white/5 hover:border-cyan-500/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Open Positions
                  </span>
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>

              <Link
                href="/orders"
                className="px-2.5 py-1.5 rounded-xl surface-card border border-white/5 hover:border-cyan-500/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Recent Trades
                  </span>
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>

              <Link
                href="/events"
                className="px-2.5 py-1.5 rounded-xl surface-card border border-white/5 hover:border-cyan-500/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    </svg>
                  </div>
                  <span className="text-[11px] font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Economic Calendar
                  </span>
                </div>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </div>
          </div>

          {/* Widget 3: Assistant Capabilities */}
          <div className="surface-card p-3 rounded-2xl border border-white/8 space-y-1.5 shrink-0">
            <h3 className="text-xs font-bold text-foreground">Assistant Capabilities</h3>
            <div className="space-y-1 text-[11px]">
              {[
                "Portfolio & PnL Analysis",
                "Trade & Position Insights",
                "Risk & Performance Metrics",
                "Economic Event Analysis",
                "Market & Strategy Insights",
              ].map((cap) => (
                <div key={cap} className="flex items-center gap-2 text-muted-foreground">
                  <div className="w-3.5 h-3.5 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-[9px] shrink-0 font-bold">
                    ✓
                  </div>
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Widget 4: Tip of the Day Carousel */}
          <div className="surface-card p-3 rounded-2xl border border-white/8 space-y-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                <span>💡</span> Tip of the day
              </div>
              <div className="flex items-center gap-1">
                {tips.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTipIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      tipIndex === i ? "w-4 bg-cyan-400 shadow-glow-cyan" : "w-1.5 bg-white/20"
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/80 leading-snug">
              {tips[tipIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
