"use client";
// src/app/(app)/assistant/page.tsx
// AlgoFin — AI Assistant powered by Gemini Flash (matching reference screenshot UI)

import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id:        string;
  role:      "user" | "assistant" | "tool";
  content:   string;
  tool_name?: string;
  streaming?: boolean;
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

const UserIcon = () => (
  <div className="w-7 h-7 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  </div>
);

// ── Robot Graphic ─────────────────────────────────────────────────────────────
const RobotGraphic = () => (
  <div className="relative w-48 h-32 shrink-0 flex items-center justify-center">
    {/* Background Radial Glow */}
    <div className="absolute inset-0 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

    {/* Pedestal Ellipse */}
    <div className="absolute bottom-2 w-32 h-8 rounded-full border border-cyan-400/30 bg-cyan-500/5 shadow-glow-cyan" />
    <div className="absolute bottom-3 w-24 h-5 rounded-full border border-cyan-300/40 bg-cyan-400/10" />

    {/* Robot Head Graphic */}
    <div className="relative z-10 flex flex-col items-center">
      {/* Robot Antenna */}
      <div className="w-1.5 h-3 bg-cyan-400 rounded-full mb-0.5 animate-pulse" />
      {/* Robot Head Outer Box */}
      <div className="w-16 h-14 rounded-2xl bg-gradient-to-b from-slate-900 to-cyan-950 border border-cyan-400/40 shadow-glow-cyan flex items-center justify-center p-2">
        {/* Visor Screen */}
        <div className="w-full h-full rounded-xl bg-black/80 border border-cyan-500/30 flex items-center justify-center gap-2">
          {/* Glowing Eyes */}
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
        </div>
      </div>
      {/* Body Shoulders */}
      <div className="w-12 h-4 rounded-t-xl bg-slate-800 border-t border-x border-cyan-400/30 -mt-1" />
    </div>

    {/* Floating Badge 1: Top Left Chart Icon */}
    <div className="absolute top-1 left-2 p-1.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 shadow-lg text-cyan-400">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    </div>

    {/* Floating Badge 2: Top Right 'hi' Bubble */}
    <div className="absolute top-0 right-2 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-[10px] font-semibold text-cyan-300 flex items-center gap-1">
      <span>hi</span>
      <div className="w-3.5 h-3.5 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </div>
    </div>

    {/* Floating Badge 3: Left Calendar */}
    <div className="absolute bottom-5 left-0 p-1.5 rounded-xl bg-slate-900/90 border border-cyan-500/30 shadow-lg text-cyan-400">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    </div>

    {/* Floating Badge 4: Right Coins */}
    <div className="absolute bottom-5 right-0 p-1.5 rounded-xl bg-slate-900/90 border border-amber-500/30 shadow-lg text-amber-400">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
        <path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
      </svg>
    </div>
  </div>
);

// ── Markdown renderer ─────────────────────────────────────────────────────────
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

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "tool") {
    return (
      <div className="flex justify-center py-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 px-3 py-1.5 rounded-full bg-white/5 border border-white/5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400/60">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
          Called <span className="font-mono text-cyan-400/70">{msg.tool_name}()</span>
        </div>
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-cyan-500/15 border border-cyan-500/20 text-xs text-foreground">
          {msg.content}
        </div>
        <UserIcon />
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 mt-0.5">
        <GeminiIcon />
      </div>
      <div className="max-w-[85%] space-y-2">
        {msg.tool_call && msg.tool_call.status === "running" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-3.5 h-3.5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            Calling <span className="font-mono text-cyan-400">{msg.tool_call.tool}()</span>…
          </div>
        )}
        {msg.content && (
          <div className="text-xs text-foreground/90 leading-relaxed">
            <RenderMarkdown text={msg.content} />
            {msg.streaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-cyan-400/60 rounded-sm animate-pulse align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

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
        }));
        setMessages(loaded);
      } catch { /* no history yet */ }
      finally { setLoadingHistory(false); }
    };
    load();
  }, []);

  const addMessage = (msg: Partial<Message> & { role: Message["role"]; content: string }) => {
    const id = Math.random().toString(36).slice(2);
    const full: Message = { id, streaming: false, ...msg };
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
          } catch { /* skip malformed */ }
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
    if (!confirm("Clear your chat history?")) return;
    try { await api.delete("/assistant/thread"); } catch { /* ignore */ }
    setMessages([]);
  };

  const hasHistory = messages.length > 0;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* ── Top Header Bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-foreground">AI Assistant</h1>
          <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <GeminiIcon />
            Powered by Gemini Flash
          </span>
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          <span>Clear history</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* ── Banners for Errors ───────────────────────────────────────────── */}
      {apiKeyMissing && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
          ⚠ Gemini API key invalid or missing. Update <code className="font-mono">GEMINI_API_KEY</code> in your backend.
        </div>
      )}
      {quotaError && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center justify-between">
          <span>⚠ Gemini free-tier daily quota limit reached.</span>
          <button onClick={() => setQuotaError(null)} className="underline text-[11px]">Dismiss</button>
        </div>
      )}

      {/* ── Top Hero Welcome Banner (Always Visible) ──────────────────────── */}
      <div className="surface-card p-6 rounded-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="space-y-2.5 max-w-2xl">
          <h2 className="text-base md:text-lg font-bold text-foreground leading-snug">
            Hello! I am your AlgoFin trading assistant, specializing in multi-exchange crypto trading.
          </h2>
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            I can help you monitor your portfolio, track your realized profit and loss (PnL), check your open positions, view recent trades, and keep an eye on upcoming high-impact economic events.
          </p>
          <p className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5 pt-1">
            <span>✈</span> How can I assist you today?
          </p>
        </div>
        <RobotGraphic />
      </div>

      {/* ── Active Conversation Stream (Shown when messages exist) ──────── */}
      {hasHistory && (
        <div className="surface-card p-6 space-y-4 max-h-[450px] overflow-y-auto border border-cyan-500/20 shadow-glow-cyan">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          <div ref={bottomRef} />
        </div>
      )}

          {/* ── Section 1: "What I can help you with" (5 Cards Row) ─────────── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              What I can help you with
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Card 1: Portfolio Overview */}
              <div
                onClick={() => sendMessage("Get a real-time summary of my portfolio and account balance.")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                    <path d="M22 12A10 10 0 0 0 12 2v10z" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Portfolio Overview
                  </h4>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                    Get a real-time summary of your portfolio and account balance.
                  </p>
                </div>
              </div>

              {/* Card 2: Profit & Loss (PnL) */}
              <div
                onClick={() => sendMessage("What is my realized PnL and performance over time?")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Profit & Loss (PnL)
                  </h4>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                    Track your realized PnL and performance over time.
                  </p>
                </div>
              </div>

              {/* Card 3: Open Positions */}
              <div
                onClick={() => sendMessage("Show me my open positions, entry price, and PnL.")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Open Positions
                  </h4>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                    View your open positions, entry price, PnL and more.
                  </p>
                </div>
              </div>

              {/* Card 4: Recent Trades */}
              <div
                onClick={() => sendMessage("Check my recent trades and order history.")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Recent Trades
                  </h4>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                    Check your recent trades and order history.
                  </p>
                </div>
              </div>

              {/* Card 5: Economic Events */}
              <div
                onClick={() => sendMessage("Stay updated on upcoming high-impact events.")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                    Economic Events
                  </h4>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                    Stay updated on upcoming high-impact events.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Section 2: "Quick actions" (5 Horizontal Pill Buttons) ──────── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Quick actions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              {/* Action 1 */}
              <button
                type="button"
                onClick={() => sendMessage("What's my realized PnL this month?")}
                className="px-3.5 py-2.5 rounded-xl surface-card border border-white/6 hover:border-cyan-500/30 transition-all flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    </svg>
                  </div>
                  <span className="text-xs text-foreground group-hover:text-cyan-400 transition-colors truncate">
                    What's my realized PnL this month?
                  </span>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-1">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Action 2 */}
              <button
                type="button"
                onClick={() => sendMessage("Show me my open positions")}
                className="px-3.5 py-2.5 rounded-xl surface-card border border-white/6 hover:border-cyan-500/30 transition-all flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                    </svg>
                  </div>
                  <span className="text-xs text-foreground group-hover:text-cyan-400 transition-colors truncate">
                    Show me my open positions
                  </span>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-1">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Action 3 */}
              <button
                type="button"
                onClick={() => sendMessage("What's my estimated monthly fee?")}
                className="px-3.5 py-2.5 rounded-xl surface-card border border-white/6 hover:border-cyan-500/30 transition-all flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  </div>
                  <span className="text-xs text-foreground group-hover:text-cyan-400 transition-colors truncate">
                    What's my estimated monthly fee?
                  </span>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-1">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Action 4 */}
              <button
                type="button"
                onClick={() => sendMessage("Any high-impact events today?")}
                className="px-3.5 py-2.5 rounded-xl surface-card border border-white/6 hover:border-cyan-500/30 transition-all flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    </svg>
                  </div>
                  <span className="text-xs text-foreground group-hover:text-cyan-400 transition-colors truncate">
                    Any high-impact events today?
                  </span>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-1">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Action 5 */}
              <button
                type="button"
                onClick={() => sendMessage("Show my recent trades")}
                className="px-3.5 py-2.5 rounded-xl surface-card border border-white/6 hover:border-cyan-500/30 transition-all flex items-center justify-between text-left group"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-5 h-5 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6" />
                    </svg>
                  </div>
                  <span className="text-xs text-foreground group-hover:text-cyan-400 transition-colors truncate">
                    Show my recent trades
                  </span>
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-1">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Section 3: "Suggested questions" (3x2 Cards Grid) ──────────── */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Suggested questions
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Q1 */}
              <div
                onClick={() => sendMessage("How has my PnL performed this week?")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                      How has my PnL performed this week?
                    </h4>
                    <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                      Get a weekly performance summary.
                    </p>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              {/* Q2 */}
              <div
                onClick={() => sendMessage("What are my top losing trades?")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                      What are my top losing trades?
                    </h4>
                    <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                      Review your losing trades.
                    </p>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              {/* Q3 */}
              <div
                onClick={() => sendMessage("Show me my trading volume summary.")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                      Show me my trading volume summary.
                    </h4>
                    <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                      View your trading activity overview.
                    </p>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              {/* Q4 */}
              <div
                onClick={() => sendMessage("Which assets contributed the most to my profit?")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                      Which assets contributed the most to my profit?
                    </h4>
                    <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                      See top gainers and losers.
                    </p>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              {/* Q5 */}
              <div
                onClick={() => sendMessage("What are the upcoming high-impact events?")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                      What are the upcoming high-impact events?
                    </h4>
                    <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                      Check today's and this week's events.
                    </p>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>

              {/* Q6 */}
              <div
                onClick={() => sendMessage("What's my margin usage?")}
                className="surface-card p-4 rounded-xl border border-white/6 hover:border-cyan-500/30 transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-cyan-400 transition-colors">
                      What's my margin usage?
                    </h4>
                    <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                      Check your margin and risk overview.
                    </p>
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </div>
          </div>
      {/* ── Bottom Chat Input Area ────────────────────────────────────────── */}
      <div className="surface-card p-3 rounded-2xl border border-white/10 space-y-2">
        <div className="flex items-center gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your portfolio..."
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center justify-center text-[10px] text-muted-foreground/50 gap-2 border-t border-white/5 pt-1.5">
          <span>Enter to send</span>
          <span>•</span>
          <span>Shift + Enter for new line</span>
          <span>•</span>
          <span className="text-cyan-400/70 font-medium">Gemini Flash</span>
        </div>
      </div>
    </div>
  );
}
