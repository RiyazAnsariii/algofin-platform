"use client";
// src/app/(app)/assistant/page.tsx
// AlgoFin — AI Assistant (matching reference mockup UI)

import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import Link from "next/link";

import { cachedGet } from "@/lib/apiCache";

// ── Types ─────────────────────────────────────────────────────────────────────
interface PortfolioSummaryData {
  total_value_usdt:   number;
  open_positions:     number;
  realized_pnl_mtd:   number;
  connected_accounts: number;
}

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
  const [hideBalance, setHideBalance]     = useState(false);
  const [activeQuickAccess, setActiveQuickAccess] = useState("Portfolio Overview");

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

  const [portfolioSummary, setPortfolioSummary]         = useState<PortfolioSummaryData | null>(null);
  const [refreshingPortfolio, setRefreshingPortfolio] = useState(false);

  const loadPortfolioSummary = useCallback(async () => {
    setRefreshingPortfolio(true);
    try {
      const data = await cachedGet<PortfolioSummaryData>("/dashboard/summary", 30_000);
      setPortfolioSummary(data);
    } catch {
      setPortfolioSummary({ total_value_usdt: 0, open_positions: 0, realized_pnl_mtd: 0, connected_accounts: 0 });
    } finally {
      setRefreshingPortfolio(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolioSummary();
  }, [loadPortfolioSummary]);

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

  const [editingMsgId, setEditingMsgId]   = useState<string | null>(null);
  const [editMsgText, setEditMsgText]     = useState("");

  const handleDeleteMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const startEditMessage = (id: string, currentText: string) => {
    setEditingMsgId(id);
    setEditMsgText(currentText);
  };

  const saveEditMessage = (id: string) => {
    if (!editMsgText.trim()) return;
    setMessages((prev) => prev.map((m) => m.id === id ? { ...m, content: editMsgText.trim() } : m));
    const textToSend = editMsgText.trim();
    setEditingMsgId(null);
    setEditMsgText("");
    sendMessage(textToSend);
  };

  const quickAccessItems = [
    {
      title: "Portfolio Overview",
      subtitle: "Total balance and performance summary",
      href: "/dashboard",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <rect x="7" y="10" width="3" height="8" rx="1" />
          <rect x="12" y="6" width="3" height="12" rx="1" />
          <rect x="17" y="13" width="3" height="5" rx="1" />
        </svg>
      ),
    },
    {
      title: "Profit & Loss (PnL)",
      subtitle: "Track your realized and unrealized PnL",
      href: "/journal",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      ),
    },
    {
      title: "Open Positions",
      subtitle: "View all your open positions",
      href: "/orders",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
        </svg>
      ),
    },
    {
      title: "Recent Trades",
      subtitle: "Your latest closed trades",
      href: "/orders",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
    {
      title: "Economic Calendar",
      subtitle: "Upcoming high-impact economic events",
      href: "/events",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] max-w-7xl mx-auto overflow-hidden gap-3">
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
          className="px-3.5 py-1.5 rounded-full border border-white/10 bg-black/40 text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-all flex items-center gap-2 shrink-0"
        >
          <span>Clear conversation</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
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
        {/* ── Left Column (~65% width): Chat & Inputs ────────────────────── */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col h-full overflow-hidden gap-3">
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

            {/* Quick Suggestion Chips when no history */}
            {messages.length === 0 && !loadingHistory && (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-3 opacity-80">
                <p className="text-xs text-muted-foreground">Start a conversation by typing below or picking a quick topic:</p>
                <div className="flex flex-wrap justify-center gap-2 max-w-md">
                  <button
                    onClick={() => sendMessage("Show me my open positions")}
                    className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/30 text-xs text-muted-foreground hover:text-foreground transition-all"
                  >
                    💼 Show me my open positions
                  </button>
                  <button
                    onClick={() => sendMessage("What's my realized PnL this month?")}
                    className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/30 text-xs text-muted-foreground hover:text-foreground transition-all"
                  >
                    📊 What's my realized PnL this month?
                  </button>
                  <button
                    onClick={() => sendMessage("Any high-impact events today?")}
                    className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/30 text-xs text-muted-foreground hover:text-foreground transition-all"
                  >
                    📅 Any high-impact events today?
                  </button>
                </div>
              </div>
            )}

            {/* Active Real User/Assistant Messages */}
            {messages.map((msg) => (
              <div key={msg.id} className="group">
                {msg.role === "user" ? (
                  <div className="flex flex-col items-end space-y-1">
                    <div className="flex items-center gap-2 mr-11">
                      <button
                        type="button"
                        onClick={() => startEditMessage(msg.id, msg.content)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-cyan-400 hover:underline transition-opacity flex items-center gap-0.5"
                        title="Edit message"
                      >
                        ✏ Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-rose-400 hover:underline transition-opacity flex items-center gap-0.5"
                        title="Delete message"
                      >
                        🗑 Delete
                      </button>
                      <span className="text-[10px] text-muted-foreground/60">{msg.time || "Now"}</span>
                    </div>

                    <div className="flex items-start gap-3 justify-end w-full">
                      {editingMsgId === msg.id ? (
                        <div className="max-w-[80%] w-full surface-card p-3 rounded-2xl border border-cyan-500/40 space-y-2">
                          <textarea
                            value={editMsgText}
                            onChange={(e) => setEditMsgText(e.target.value)}
                            rows={2}
                            className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-xs text-foreground outline-none resize-y font-sans"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMsgId(null)}
                              className="px-2.5 py-1 rounded-lg border border-white/10 text-[11px] text-muted-foreground hover:text-foreground transition-all"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => saveEditMessage(msg.id)}
                              className="px-3 py-1 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black text-[11px] font-semibold transition-all shadow-glow-cyan"
                            >
                              Save & Submit
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-[#0e2a36] border border-cyan-500/30 text-xs text-foreground leading-relaxed">
                          {msg.content}
                        </div>
                      )}
                      <UserAvatar />
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <RobotAvatar />
                    <div className="max-w-[85%] space-y-1.5 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground/60">{msg.time || "Now"}</span>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(msg.content);
                              alert("Message copied to clipboard!");
                            }}
                            className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5"
                            title="Copy message"
                          >
                            📋 Copy
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="text-[10px] text-rose-400 hover:underline flex items-center gap-0.5"
                            title="Delete message"
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </div>
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

        {/* ── Right Sidebar Column (~35% width): Exact Mockup UI ──────────── */}
        <div className="lg:col-span-5 xl:col-span-4 h-full flex flex-col overflow-y-auto pr-1 gap-4.5">
          {/* Widget 1: Portfolio Summary */}
          {(() => {
            const totalBalance = portfolioSummary?.total_value_usdt ?? 0;
            const connectedAccounts = portfolioSummary?.connected_accounts ?? 0;
            const mtdPnl = portfolioSummary?.realized_pnl_mtd ?? 0;
            return (
              <div className="surface-card p-4 rounded-2xl border border-white/10 space-y-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-bold text-foreground">Portfolio Summary</h3>
                    {connectedAccounts > 0 ? (
                      <span className="text-[11px] text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        Live ({connectedAccounts})
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadPortfolioSummary()}
                    className={`w-7 h-7 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center ${refreshingPortfolio ? "animate-spin" : ""}`}
                    title="Refresh portfolio"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                      TOTAL BALANCE
                    </p>
                    <p className="text-xl font-bold text-foreground tracking-tight">
                      {hideBalance
                        ? "•••••• USDT"
                        : `${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setHideBalance(!hideBalance)}
                      className="text-xs text-muted-foreground hover:text-foreground font-medium flex items-center gap-1.5 transition-colors pt-0.5 select-none"
                    >
                      {hideBalance ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>Show Balance</span>
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                            <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                            <line x1="2" y1="2" x2="22" y2="22" />
                          </svg>
                          <span>Hide Balance</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="w-[1px] bg-white/10 my-1 self-stretch shrink-0" />

                  <div className="flex-1 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
                      MTD PNL
                    </p>
                    <p className={`text-xl font-bold tracking-tight ${mtdPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {mtdPnl >= 0 ? "+" : ""}{mtdPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                    </p>
                    <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 pt-0.5">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                        <polyline points="16 7 22 7 22 13" />
                      </svg>
                      <span>0.00%</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Widget 2: Quick Access Links */}
          <div className="space-y-3 shrink-0">
            <div className="flex items-center gap-2 px-1">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                <circle cx="9" cy="5" r="1.5" fill="currentColor" />
                <circle cx="9" cy="12" r="1.5" fill="currentColor" />
                <circle cx="9" cy="19" r="1.5" fill="currentColor" />
                <circle cx="15" cy="5" r="1.5" fill="currentColor" />
                <circle cx="15" cy="12" r="1.5" fill="currentColor" />
                <circle cx="15" cy="19" r="1.5" fill="currentColor" />
              </svg>
              <h3 className="text-sm font-bold text-foreground">Quick Access</h3>
            </div>

            <div className="space-y-2">
              {quickAccessItems.map((item) => {
                const isActive = activeQuickAccess === item.title;
                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    onClick={() => setActiveQuickAccess(item.title)}
                    className={`p-3 rounded-2xl border transition-all flex items-center justify-between group ${
                      isActive
                        ? "border-cyan-500/50 bg-cyan-950/20 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                        : "surface-card border-white/8 hover:border-cyan-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                        isActive
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                          : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/20"
                      }`}>
                        {item.icon}
                      </div>
                      <div className="space-y-0.5">
                        <span className={`text-xs sm:text-sm font-bold block transition-colors ${
                          isActive ? "text-cyan-400" : "text-foreground group-hover:text-cyan-400"
                        }`}>
                          {item.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground block leading-tight">
                          {item.subtitle}
                        </span>
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-cyan-400 transition-colors shrink-0 ml-2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Widget 3: Assistant Capabilities */}
          <div className="surface-card p-4 rounded-2xl border border-white/10 space-y-4 shrink-0">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
              </svg>
              <h3 className="text-sm font-bold text-foreground">Assistant Capabilities</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3.5 text-xs">
              <div className="space-y-3.5">
                {[
                  "Portfolio & PnL Analysis",
                  "Trade & Position Insights",
                  "Risk & Performance Metrics",
                ].map((cap) => (
                  <div key={cap} className="flex items-center gap-2.5 text-muted-foreground font-medium">
                    <div className="w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="leading-tight">{cap}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3.5">
                {[
                  "Economic Event Analysis",
                  "Market & Strategy Insights",
                ].map((cap) => (
                  <div key={cap} className="flex items-center gap-2.5 text-muted-foreground font-medium">
                    <div className="w-4 h-4 rounded-full bg-emerald-500 text-black flex items-center justify-center shrink-0">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="leading-tight">{cap}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-white/10 pt-3 mt-4 text-center">
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); alert("AI Assistant documentation coming soon."); }}
                className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              >
                <span>Learn more about AI Assistant</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>

          {/* Widget 4: Tip of the Day Carousel */}
          <div className="surface-card p-4 rounded-2xl border border-white/10 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 text-xs sm:text-sm font-bold">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                </svg>
                <span>Tip of the day</span>
              </div>
              <div className="flex items-center gap-1.5">
                {tips.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTipIndex(i)}
                    className={`h-2 rounded-full transition-all ${
                      tipIndex === i ? "w-6 bg-cyan-400 shadow-[0_0_8px_#22d3ee]" : "w-3 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground/90 leading-relaxed">
              {tips[tipIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
