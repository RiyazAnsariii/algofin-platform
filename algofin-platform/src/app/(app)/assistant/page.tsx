"use client";
// src/app/(app)/assistant/page.tsx
// AlgoFin v1 — AI Assistant powered by Gemini 2.0 Flash (free tier)
//
// Features:
//   - Streaming SSE chat with Gemini
//   - Tool call display (shows when fetching portfolio data)
//   - Persistent thread — history loads on mount
//   - Markdown-style formatting for responses
//   - Reset chat button

import { useEffect, useRef, useState, useCallback } from "react";
import api from "@/lib/api";
import { useDelayedLoading } from "@/hooks/useDelayedLoading";

// ── Types ─────────────────────────────────────────────────────────
interface Message {
  id:        string;
  role:      "user" | "assistant" | "tool";
  content:   string;
  tool_name?: string;
  streaming?: boolean;
  tool_call?: { tool: string; status: "running" | "done" };
}

// ── Suggested prompts ────────────────────────────────────────────
const SUGGESTED = [
  "What's my realized PnL this month?",
  "Show me my open positions",
  "What's my estimated monthly fee?",
  "Any high-impact events today?",
  "Show my recent trades",
];

// ── Icons ─────────────────────────────────────────────────────────
const GeminiIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="gem-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4ECDC4" />
        <stop offset="100%" stopColor="#06B6D4" />
      </linearGradient>
    </defs>
    <path
      d="M12 2C6.5 8.5 6.5 15.5 12 22C17.5 15.5 17.5 8.5 12 2Z"
      fill="url(#gem-grad)"
    />
    <path
      d="M2 12C8.5 6.5 15.5 6.5 22 12C15.5 17.5 8.5 17.5 2 12Z"
      fill="url(#gem-grad)"
      opacity={0.6}
    />
  </svg>
);

const UserIcon = () => (
  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  </div>
);

const ToolIcon = ({ name }: { name: string }) => (
  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 font-mono px-2 py-1 rounded bg-surface-2 border border-white/5 w-fit">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </svg>
    {name}()
  </div>
);

// ── Simple markdown renderer (bold, code, bullets) ────────────────
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
              <span className="text-primary mt-1 shrink-0">·</span>
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
      return <code key={i} className="px-1 py-0.5 rounded bg-surface-2 font-mono text-[11px] text-primary">{part.slice(1, -1)}</code>;
    if (/^\$[\d,]+/.test(part))
      return <span key={i} className="text-emerald-400 font-medium">{part}</span>;
    return <span key={i}>{part}</span>;
  });
}

// ── Message bubble ────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "tool") {
    return (
      <div className="flex justify-center py-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60 px-3 py-1.5 rounded-full bg-surface-2/50 border border-white/5">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/60">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
          Called <span className="font-mono text-primary/70">{msg.tool_name}()</span>
        </div>
      </div>
    );
  }

  if (msg.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-tr-md bg-primary/15 border border-primary/20 text-sm text-foreground">
          {msg.content}
        </div>
        <UserIcon />
      </div>
    );
  }

  // assistant
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-surface-2 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
        <GeminiIcon />
      </div>
      <div className="max-w-[85%] space-y-2">
        {msg.tool_call && msg.tool_call.status === "running" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            Calling <span className="font-mono text-primary/80">{msg.tool_call.tool}()</span>…
          </div>
        )}
        {msg.content && (
          <div className="text-sm text-foreground/90 leading-relaxed">
            <RenderMarkdown text={msg.content} />
            {msg.streaming && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary/60 rounded-sm animate-pulse align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Suggested prompt chips ─────────────────────────────────────────
function PromptChips({ onSelect }: { onSelect: (p: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {SUGGESTED.map((p) => (
        <button
          key={p}
          onClick={() => onSelect(p)}
          className="px-3 py-1.5 rounded-full text-xs text-muted-foreground border border-white/8
            hover:border-primary/30 hover:text-foreground hover:bg-primary/5 transition-all"
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function AssistantPage() {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState("");
  const [streaming, setStreaming]       = useState(false);
  const [threadId, setThreadId]         = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const showHistoryLoading                  = useDelayedLoading(loadingHistory);
  const [apiKeyMissing, setApiKeyMissing]   = useState(false);
  const [quotaError, setQuotaError]         = useState<string | null>(null);
  const [keyError, setKeyError]             = useState<string | null>(null);
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
      } catch { /* no thread yet or server down */ }
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

    // Add user message
    addMessage({ role: "user", content: userText });

    // Placeholder for assistant response
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
      let   activeToolId: string | null = null;

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
              args?: object;
              result?: object;
              message?: string;
            };

            if (event.type === "chunk" && event.content) {
              fullText += event.content;
              updateMessage(assistantId, { content: fullText, streaming: true });
            }

            if (event.type === "tool_call") {
              // Insert a tool indicator message
              addMessage({ role: "tool", content: "", tool_name: event.tool });
              updateMessage(assistantId, {
                tool_call: { tool: event.tool!, status: "running" },
              });
            }

            if (event.type === "tool_result") {
              updateMessage(assistantId, {
                tool_call: undefined,
              });
            }

            if (event.type === "done") {
              updateMessage(assistantId, { streaming: false });
            }

            if (event.type === "error") {
              const errMsg = event.message ?? "Unknown error";
              // Categorise error type for the banner
              if (errMsg.includes("GEMINI_API_KEY") || errMsg.includes("not configured") || errMsg.includes("invalid or has been revoked")) {
                setKeyError(errMsg);
                setApiKeyMissing(true);
              } else if (
                errMsg.includes("quota") ||
                errMsg.includes("429") ||
                errMsg.includes("quota has been reached") ||
                errMsg.includes("quota exceeded") ||
                errMsg.includes("daily limit") ||
                errMsg.includes("temporarily unavailable")
              ) {
                setQuotaError(errMsg);
              }
              // Remove empty placeholder — error is shown in banner, not in chat
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            }
          } catch { /* malformed event — skip */ }
        }
      }

      updateMessage(assistantId, { streaming: false });
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User pressed Stop — remove the empty placeholder silently
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
      } else {
        const isBackendDown = err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError") || err.message?.includes("HTTP 5");
        updateMessage(assistantId, {
          content: isBackendDown
            ? "⚠ Cannot reach the backend. Make sure the FastAPI server is running: `cd algofin-backend && python -m uvicorn app.main:app --reload`"
            : `⚠ ${err.message ?? "Unknown error"}`,
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

  const isEmpty = messages.length === 0 && !loadingHistory;

  return (
    <div className="-m-6 flex flex-col h-[calc(100vh-3.5rem)] lg:h-screen max-w-3xl lg:max-w-none">
      {/* Header */}
      <div className="px-6 h-14 flex items-center justify-between border-b border-white/6 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-surface-2 border border-white/10 flex items-center justify-center">
            <GeminiIcon />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">AI Assistant</p>
            <p className="text-[10px] text-muted-foreground">Powered by Gemini Flash</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleReset}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            Clear history
          </button>
        )}
      </div>

      {/* API key missing banner */}
      {apiKeyMissing && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          <strong>⚠ Gemini API key invalid or revoked.</strong>{" "}
          Go to{" "}
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-semibold">
            aistudio.google.com
          </a>{" "}
          → Create API key → Copy it → open{" "}
          <code className="font-mono bg-red-500/10 px-1 rounded">algofin-backend/.env</code>{" "}
          → replace <code className="font-mono bg-red-500/10 px-1 rounded">GEMINI_API_KEY=...</code> → restart backend.
        </div>
      )}

      {/* Quota exceeded banner */}
      {quotaError && !apiKeyMissing && (
        <div className="mx-4 mt-4 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-300 space-y-1">
          <p><strong>⚠ Gemini free-tier quota exhausted.</strong></p>
          <p className="text-amber-400/80 text-xs">
            Your current API key has hit its daily limit. Options:
          </p>
          <ul className="list-disc list-inside text-xs text-amber-400/80 space-y-0.5">
            <li>Wait until midnight Pacific Time for the quota to reset</li>
            <li>
              Get a new API key at{" "}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline">
                aistudio.google.com/app/apikey
              </a>{" "}
              and update <code className="font-mono">GEMINI_API_KEY</code> in{" "}
              <code className="font-mono">algofin-backend/.env</code>
            </li>
            <li>Enable billing on your Google AI project for higher limits</li>
          </ul>
          <button
            onClick={() => setQuotaError(null)}
            className="text-xs text-amber-400/60 hover:text-amber-300 mt-1 underline"
          >Dismiss</button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {showHistoryLoading ? (
          <div className="flex justify-center">
            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : isEmpty ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full gap-6 pb-10">
            <div className="space-y-2 text-center">
              <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-white/10 flex items-center justify-center mx-auto">
                <GeminiIcon />
              </div>
              <p className="text-base font-semibold text-foreground">Ask anything about your portfolio</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                I have live access to your positions, trades, PnL, and upcoming economic events.
              </p>
            </div>
            <PromptChips onSelect={(p) => { setInput(p); sendMessage(p); }} />
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested chips (shown when history exists but not typing) */}
      {!isEmpty && !streaming && messages.length > 0 && messages.length < 4 && (
        <div className="px-4 pb-3">
          <PromptChips onSelect={(p) => { setInput(p); sendMessage(p); }} />
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-white/6 shrink-0">
        <div className={`flex items-end gap-2 rounded-xl border transition-all bg-surface-1
          ${streaming ? "border-primary/20" : "border-white/8 focus-within:border-primary/40"}`}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your portfolio…"
            rows={1}
            className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-foreground
              placeholder:text-muted-foreground/50 outline-none max-h-32 leading-relaxed"
            style={{ minHeight: "44px" }}
          />
          <div className="flex items-center gap-1 pr-2 pb-2">
            {streaming ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/20 flex items-center justify-center
                  hover:bg-rose-500/25 transition-all text-rose-400"
                title="Stop"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center
                  hover:bg-primary/90 active:scale-95 transition-all glow-cyan-sm
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-primary-foreground -rotate-90">
                  <path d="M12 5l7 7-7 7M5 12h14" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/40 text-center mt-2">
          Enter to send · Shift+Enter for new line · Gemini Flash
        </p>
      </div>
    </div>
  );
}
