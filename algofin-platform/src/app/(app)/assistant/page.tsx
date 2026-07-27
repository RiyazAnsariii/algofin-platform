"use client";
// src/app/(app)/assistant/page.tsx
// AlgoFin — AI Assistant with Conversation History Panel

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

interface SavedConversation {
  id:        string;
  title:     string;
  messages:  Message[];
  createdAt: string;  // ISO string
  updatedAt: string;  // ISO string
  pinned:    boolean;
}

// ── LocalStorage helpers ───────────────────────────────────────────────────────
const LS_KEY = "algofin-conversations";

function loadConversations(): SavedConversation[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SavedConversation[]) : [];
  } catch { return []; }
}

function saveConversations(convos: SavedConversation[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(convos)); } catch { /* ignore */ }
}

function generateTitle(messages: Message[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New Conversation";
  const text = firstUser.content.trim();
  return text.length > 40 ? text.slice(0, 40) + "…" : text;
}

function groupByDate(convos: SavedConversation[]) {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();
  const pinned: SavedConversation[] = [];
  const today: SavedConversation[] = [];
  const yesterday: SavedConversation[] = [];
  const earlier: SavedConversation[] = [];
  for (const c of convos) {
    if (c.pinned) { pinned.push(c); continue; }
    const d = new Date(c.updatedAt).toDateString();
    if (d === todayStr) today.push(c);
    else if (d === yesterdayStr) yesterday.push(c);
    else earlier.push(c);
  }
  return { pinned, today, yesterday, earlier };
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

// ── Conversation History Panel ────────────────────────────────────────────────
function ConversationsPanel({
  open,
  conversations,
  activeId,
  onNew,
  onLoad,
  onDelete,
  onTogglePin,
}: {
  open: boolean;
  conversations: SavedConversation[];
  activeId: string | null;
  onNew: () => void;
  onLoad: (c: SavedConversation) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  );
  const { pinned, today, yesterday, earlier } = groupByDate(filtered);

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function ConvoItem({ c }: { c: SavedConversation }) {
    const isActive = c.id === activeId;
    return (
      <div
        className={`group relative flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
          isActive
            ? "bg-cyan-500/10 border border-cyan-500/20"
            : "hover:bg-white/5 border border-transparent"
        }`}
        onClick={() => { setMenuId(null); onLoad(c); }}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-medium truncate ${isActive ? "text-cyan-300" : "text-foreground/90"}`}>
            {c.title}
          </p>
          <p className="text-[10px] text-muted-foreground/60">{formatTime(c.updatedAt)}</p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuId(menuId === c.id ? null : c.id); }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
          </svg>
        </button>

        {menuId === c.id && (
          <div className="absolute right-0 top-8 z-50 bg-[#0d1f2d] border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[130px]">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTogglePin(c.id); setMenuId(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m12 17-7 5 2-8L2 9l8-1 2-7 2 7 8 1-5 5 2 8z"/>
              </svg>
              {c.pinned ? "Unpin" : "Pin"}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(c.id); setMenuId(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[11px] text-rose-400 hover:bg-rose-500/10 transition-all"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
              Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  function Section({ label, items }: { label: string; items: SavedConversation[] }) {
    if (!items.length) return null;
    return (
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest px-2 mb-1">{label}</p>
        {items.map((c) => <ConvoItem key={c.id} c={c} />)}
      </div>
    );
  }

  if (!open) return null;

  return (
    <div
      className="flex flex-col w-60 shrink-0 bg-[#080f16] border-r border-white/6 h-full overflow-hidden"
      onClick={() => setMenuId(null)}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/6 shrink-0">
        <span className="text-sm font-bold text-foreground">Conversations</span>
        <button
          type="button"
          onClick={onNew}
          className="p-1.5 rounded-lg hover:bg-white/8 text-muted-foreground hover:text-foreground transition-all"
          title="New conversation"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-2.5 py-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground shrink-0">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations"
            className="bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/50 outline-none flex-1 min-w-0"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3 min-h-0">
        {conversations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50 text-center py-6">No saved conversations yet</p>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/50 text-center py-6">No results found</p>
        ) : (
          <>
            <Section label="Pinned" items={pinned} />
            <Section label="Today" items={today} />
            <Section label="Yesterday" items={yesterday} />
            <Section label="Earlier" items={earlier} />
          </>
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
  const [tipIndex, setTipIndex]           = useState(0);
  const [hideBalance, setHideBalance]     = useState(false);
  const [activeQuickAccess, setActiveQuickAccess] = useState("Portfolio Overview");

  // ── Conversation history state ────────────────────────────────────────────
  const [historyOpen, setHistoryOpen]         = useState(false);
  const [conversations, setConversations]     = useState<SavedConversation[]>([]);
  const [activeConvoId, setActiveConvoId]     = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  const tips = [
    "Use risk controls to protect your capital before entering any position.",
    "Monitor economic events to avoid unexpected market volatility.",
    "Review your daily PnL breakdown to optimize trading win rate.",
  ];

  // Load conversations from localStorage
  useEffect(() => {
    setConversations(loadConversations());
  }, []);

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
        const loaded = res.data.data.messages
          .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
          .map((m) => ({
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

  // ── Save current conversation to localStorage ─────────────────────────────
  const saveCurrentConversation = useCallback((msgs: Message[]) => {
    if (msgs.filter((m) => m.role === "user" || m.role === "assistant").length < 2) return;
    const title = generateTitle(msgs);
    const now = new Date().toISOString();
    setConversations((prev) => {
      let updated: SavedConversation[];
      if (activeConvoId) {
        updated = prev.map((c) =>
          c.id === activeConvoId ? { ...c, title, messages: msgs, updatedAt: now } : c
        );
      } else {
        const newConvo: SavedConversation = {
          id: Math.random().toString(36).slice(2),
          title,
          messages: msgs,
          createdAt: now,
          updatedAt: now,
          pinned: false,
        };
        setActiveConvoId(newConvo.id);
        updated = [newConvo, ...prev];
      }
      saveConversations(updated);
      return updated;
    });
  }, [activeConvoId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    setStreaming(true);
    const userText = text.trim();
    setInput("");
    inputRef.current?.focus();

    const userMsgId = Math.random().toString(36).slice(2);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = { id: userMsgId, role: "user", content: userText, streaming: false, time: nowTime };

    const assistantMsgId = Math.random().toString(36).slice(2);
    const assistantMsg: Message = { id: assistantMsgId, role: "assistant", content: "", streaming: true, time: nowTime };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

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
              setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: fullText, streaming: true } : m));
            }
            if (event.type === "tool_call") {
              setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, tool_call: { tool: event.tool!, status: "running" } } : m));
            }
            if (event.type === "tool_result") {
              setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, tool_call: undefined } : m));
            }
            if (event.type === "done") {
              setMessages((prev) => {
                const updated = prev.map((m) => m.id === assistantMsgId ? { ...m, streaming: false } : m);
                // Save conversation after completion
                setTimeout(() => saveCurrentConversation(updated), 200);
                return updated;
              });
            }
            if (event.type === "error") {
              const errMsg = event.message ?? "Unknown error";
              if (errMsg.includes("GEMINI_API_KEY") || errMsg.includes("not configured")) {
                setApiKeyMissing(true);
              } else if (errMsg.includes("quota") || errMsg.includes("429")) {
                setQuotaError(errMsg);
              }
              setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
            }
          } catch { /* skip */ }
        }
      }

      setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, streaming: false } : m));
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (errorObj.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId || m.content));
      } else {
        const isBackendDown = errorObj.message?.includes("Failed to fetch") || errorObj.message?.includes("NetworkError");
        setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? {
          ...m,
          content: isBackendDown
            ? "⚠ Cannot reach the backend. Make sure the FastAPI server is running."
            : `⚠ ${errorObj.message ?? "Unknown error"}`,
          streaming: false,
        } : m));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming, saveCurrentConversation]);

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
    setActiveConvoId(null);
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

  // ── Conversation history actions ──────────────────────────────────────────
  const handleNewConversation = async () => {
    // Save the current messages before clearing
    if (messages.filter((m) => m.role === "user" || m.role === "assistant").length >= 2) {
      saveCurrentConversation(messages);
    }
    try { await api.delete("/assistant/thread"); } catch { /* ignore */ }
    setMessages([]);
    setActiveConvoId(null);
  };

  const handleLoadConversation = (convo: SavedConversation) => {
    // Save current before switching
    if (messages.filter((m) => m.role === "user" || m.role === "assistant").length >= 2) {
      saveCurrentConversation(messages);
    }
    setMessages(convo.messages);
    setActiveConvoId(convo.id);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveConversations(updated);
      return updated;
    });
    if (activeConvoId === id) {
      setMessages([]);
      setActiveConvoId(null);
    }
  };

  const handleTogglePin = (id: string) => {
    setConversations((prev) => {
      const updated = prev.map((c) => c.id === id ? { ...c, pinned: !c.pinned } : c);
      saveConversations(updated);
      return updated;
    });
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
    <div className="flex flex-col h-full w-full max-w-[1440px] mx-auto overflow-hidden gap-3 px-5 sm:px-8 py-6">
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">
        {/* ── Left Column (~75% width): History Panel + Chat ───────────── */}
        <div className="lg:col-span-8 xl:col-span-9 flex h-full overflow-hidden rounded-2xl border border-white/8 bg-[#060d14]">

          {/* ── Collapsed icon rail ── */}
          <div className="flex flex-col items-center gap-1 py-3 px-1.5 border-r border-white/6 shrink-0 bg-[#080f18]">
            {/* New chat */}
            <button
              type="button"
              onClick={handleNewConversation}
              title="New conversation"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>
              </svg>
            </button>
            {/* Search / toggle history */}
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              title="Search conversations"
              className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </button>
            {/* Pin */}
            <button
              type="button"
              title="Pinned conversations"
              onClick={() => setHistoryOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 17-7 5 2-8L2 9l8-1 2-7 2 7 8 1-5 5 2 8z"/>
              </svg>
            </button>
            {/* Recent chats */}
            <button
              type="button"
              title="Recent conversations"
              onClick={() => setHistoryOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/8 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* ··· open/close panel */}
            <button
              type="button"
              onClick={() => setHistoryOpen(!historyOpen)}
              title={historyOpen ? "Collapse history" : "Show conversation history"}
              className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all ${
                historyOpen
                  ? "bg-cyan-500/20 border border-cyan-500/30 text-cyan-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/8"
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>
              </svg>
            </button>
          </div>

          {/* ── Conversations panel (slides in) ── */}
          <ConversationsPanel
            open={historyOpen}
            conversations={conversations}
            activeId={activeConvoId}
            onNew={handleNewConversation}
            onLoad={handleLoadConversation}
            onDelete={handleDeleteConversation}
            onTogglePin={handleTogglePin}
          />

          {/* ── Chat area ── */}
          <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
            {/* Top Hero Welcome Card */}
            <div className="surface-card p-4 border-b border-white/8 flex items-center gap-4 relative overflow-hidden shrink-0">
              <RobotAvatar />
              <div className="space-y-0.5 max-w-3xl">
                <h2 className="text-xs sm:text-sm font-bold text-foreground">Hello! I&apos;m your AlgoFin trading assistant.</h2>
                <p className="text-[11px] sm:text-xs text-muted-foreground/80 leading-relaxed">
                  I can help you monitor your portfolio, track your realized profit and loss (PnL), check your open positions, view recent trades, and keep an eye on upcoming high-impact events.
                </p>
                <p className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1 pt-0.5">
                  <span>✈</span> How can I assist you today?
                </p>
              </div>
            </div>

            {/* Chat Feed Area (Flex-1 Internal Scrollbar) */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
              <div className="text-center">
                <span className="text-[11px] text-muted-foreground/50 font-medium">Today</span>
              </div>

              {/* Quick Suggestion Chips when no history */}
              {messages.length === 0 && !loadingHistory && (
                <div className="flex flex-col items-center justify-center py-8 text-center space-y-3 opacity-90">
                  <p className="text-xs text-muted-foreground">Start a conversation by typing below or picking a quick topic:</p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                    <button
                      onClick={() => sendMessage("Show me my open positions")}
                      className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/40 text-xs text-muted-foreground hover:text-cyan-300 transition-all"
                    >
                      💼 Show me my open positions
                    </button>
                    <button
                      onClick={() => sendMessage("What is my realized PnL and estimated monthly fee?")}
                      className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/40 text-xs text-muted-foreground hover:text-cyan-300 transition-all"
                    >
                      📊 What is my realized PnL &amp; estimated fee?
                    </button>
                    <button
                      onClick={() => sendMessage("How do I connect my exchange with read-only API keys?")}
                      className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/40 text-xs text-muted-foreground hover:text-cyan-300 transition-all"
                    >
                      🔑 How do I connect read-only API keys?
                    </button>
                    <button
                      onClick={() => sendMessage("How do TradingView webhooks and risk controls work?")}
                      className="px-3 py-1.5 rounded-xl surface-card border border-white/10 hover:border-cyan-500/40 text-xs text-muted-foreground hover:text-cyan-300 transition-all"
                    >
                      ⚡ How do TradingView webhooks work?
                    </button>
                  </div>
                </div>
              )}

              {/* Active Real User/Assistant Messages */}
              {messages
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((msg) => (
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
                                Save &amp; Submit
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
                        {msg.content ? (
                          <div className="text-xs text-foreground/90 leading-relaxed surface-card p-3 rounded-xl border border-white/8">
                            <RenderMarkdown text={msg.content} />
                            {msg.streaming && (
                              <span className="inline-block w-1.5 h-4 ml-0.5 bg-cyan-400/60 rounded-sm animate-pulse align-middle" />
                            )}
                          </div>
                        ) : msg.streaming ? (
                          <div className="text-xs text-cyan-400/90 surface-card p-3 rounded-xl border border-cyan-500/20 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                            <span>
                              {msg.tool_call?.tool
                                ? `Fetching ${msg.tool_call.tool.replace(/_/g, " ")}...`
                                : "Thinking..."}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Bottom Chat Input Bar */}
            <div className="surface-card p-3 border-t border-white/8 space-y-2 shrink-0 rounded-none">
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
        </div>

        {/* ── Right Sidebar Column (~25% width): Compressed Right Sidebar ─── */}
        <div className="lg:col-span-4 xl:col-span-3 h-full flex flex-col justify-between overflow-hidden gap-2">
          {/* Widget 1: Portfolio Summary */}
          {(() => {
            const totalBalance = portfolioSummary?.total_value_usdt ?? 0;
            const connectedAccounts = portfolioSummary?.connected_accounts ?? 0;
            const mtdPnl = portfolioSummary?.realized_pnl_mtd ?? 0;
            return (
              <div className="surface-card p-3 rounded-2xl border border-white/10 space-y-2 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-6.5 h-6.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
                        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
                      </svg>
                    </div>
                    <h3 className="text-xs font-bold text-foreground truncate">Portfolio Summary</h3>
                    {connectedAccounts > 0 ? (
                      <span className="text-[9px] text-emerald-400 font-semibold px-1 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                        Live ({connectedAccounts})
                      </span>
                    ) : (
                      <span className="text-[9px] text-muted-foreground font-medium px-1 py-0.2 rounded bg-white/5 border border-white/10 shrink-0">
                        Off
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => loadPortfolioSummary()}
                    className={`w-5.5 h-5.5 rounded-lg border border-white/10 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center shrink-0 ${refreshingPortfolio ? "animate-spin" : ""}`}
                    title="Refresh portfolio"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex-1 space-y-0.5 min-w-0">
                    <p className="text-[8.5px] text-muted-foreground uppercase font-semibold tracking-wider">
                      TOTAL BALANCE
                    </p>
                    <p className="text-xs sm:text-sm font-bold text-foreground tracking-tight truncate">
                      {hideBalance
                        ? "•••••• USDT"
                        : `${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
                    </p>
                    <button
                      type="button"
                      onClick={() => setHideBalance(!hideBalance)}
                      className="text-[10px] text-muted-foreground hover:text-foreground font-medium flex items-center gap-1 transition-colors select-none"
                    >
                      {hideBalance ? (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                          <span>Show</span>
                        </>
                      ) : (
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                            <path d="M6.61 6.61A13.52 13.52 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                            <line x1="2" y1="2" x2="22" y2="22" />
                          </svg>
                          <span>Hide</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="w-[1px] bg-white/10 my-0.5 self-stretch shrink-0" />

                  <div className="flex-1 space-y-0.5 min-w-0">
                    <p className="text-[8.5px] text-muted-foreground uppercase font-semibold tracking-wider">
                      MTD PNL
                    </p>
                    <p className={`text-xs sm:text-sm font-bold tracking-tight truncate ${mtdPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {mtdPnl >= 0 ? "+" : ""}{mtdPnl.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
                    </p>
                    <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
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
          <div className="space-y-1.5 shrink-0 flex-1 flex flex-col justify-between min-h-0">
            <div className="flex items-center gap-1.5 px-0.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
                <circle cx="9" cy="5" r="1.5" fill="currentColor" />
                <circle cx="9" cy="12" r="1.5" fill="currentColor" />
                <circle cx="9" cy="19" r="1.5" fill="currentColor" />
                <circle cx="15" cy="5" r="1.5" fill="currentColor" />
                <circle cx="15" cy="12" r="1.5" fill="currentColor" />
                <circle cx="15" cy="19" r="1.5" fill="currentColor" />
              </svg>
              <h3 className="text-xs font-bold text-foreground">Quick Access</h3>
            </div>

            <div className="space-y-1 flex-1 flex flex-col justify-between">
              {quickAccessItems.map((item) => {
                const isActive = activeQuickAccess === item.title;
                return (
                  <Link
                    key={item.title}
                    href={item.href}
                    onClick={() => setActiveQuickAccess(item.title)}
                    className={`px-2 py-1.5 rounded-xl border transition-all flex items-center justify-between group ${
                      isActive
                        ? "border-cyan-500/50 bg-cyan-950/20 shadow-[0_0_12px_rgba(6,182,212,0.15)]"
                        : "surface-card border-white/8 hover:border-cyan-500/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                        isActive
                          ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-400"
                          : "bg-cyan-500/10 border-cyan-500/20 text-cyan-400 group-hover:bg-cyan-500/20"
                      }`}>
                        {item.icon}
                      </div>
                      <div className="space-y-0 min-w-0">
                        <span className={`text-[11px] font-bold block transition-colors truncate ${
                          isActive ? "text-cyan-400" : "text-foreground group-hover:text-cyan-400"
                        }`}>
                          {item.title}
                        </span>
                        <span className="text-[9px] text-muted-foreground block leading-tight truncate">
                          {item.subtitle}
                        </span>
                      </div>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-cyan-400 transition-colors shrink-0 ml-1">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Widget 3: Assistant Capabilities */}
          <div className="surface-card p-2.5 rounded-2xl border border-white/10 space-y-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
              </svg>
              <h3 className="text-xs font-bold text-foreground">Assistant Capabilities</h3>
            </div>

            <div className="space-y-1.5 text-[10px]">
              {[
                "Portfolio & PnL Analysis",
                "Trade & Position Insights",
                "Risk & Performance Metrics",
                "Economic Event Analysis",
                "Market & Strategy Insights",
              ].map((cap) => (
                <div key={cap} className="flex items-center gap-1.5 text-muted-foreground font-medium">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 text-black flex items-center justify-center shrink-0">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span className="leading-tight text-[10px] truncate">{cap}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-1.5 text-center">
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); alert("AI Assistant documentation coming soon."); }}
                className="text-cyan-400 hover:text-cyan-300 text-[10px] font-semibold inline-flex items-center gap-1 transition-colors"
              >
                <span>Learn more about AI Assistant</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>

          {/* Widget 4: Tip of the Day Carousel */}
          <div className="surface-card p-3 rounded-2xl border border-white/10 space-y-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                  <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                </svg>
                <span>Tip of the day</span>
              </div>
              <div className="flex items-center gap-1">
                {tips.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTipIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      tipIndex === i ? "w-5 bg-cyan-400 shadow-[0_0_8px_#22d3ee]" : "w-2.5 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground/90 leading-snug">
              {tips[tipIndex]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
