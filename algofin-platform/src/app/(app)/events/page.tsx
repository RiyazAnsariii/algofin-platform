"use client";
// src/app/(app)/events/page.tsx
// AlgoFin — Economic Calendar (matching reference mockup UI)

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { cachedGet } from "@/lib/apiCache";
import type { EconomicEvent, ImpactLevel } from "@/types/events";
import { relativeTime } from "@/lib/staleness";

// ── Helpers ───────────────────────────────────────────────────────────────────
const IMPACT_MAP: Record<ImpactLevel, { label: string; cls: string; dot: string }> = {
  high:   { label: "High",   cls: "text-rose-400",   dot: "bg-rose-400" },
  medium: { label: "Medium", cls: "text-amber-400",  dot: "bg-amber-400" },
  low:    { label: "Low",    cls: "text-muted-foreground", dot: "bg-muted-foreground/40" },
};

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isTomorrow = d.toDateString() === new Date(now.getTime() + 86400_000).toDateString();

  const time = d.toLocaleTimeString("en-US", {
    hour:   "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  if (isToday)    return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;

  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month:   "short",
    day:     "numeric",
  }) + ` ${time}`;
}

function groupByDate(events: EconomicEvent[]): Map<string, EconomicEvent[]> {
  const groups = new Map<string, EconomicEvent[]>();
  for (const e of events) {
    const day = e.event_time.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }
  return groups;
}

function dayLabel(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const now = new Date();
  const todayStr    = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400_000).toISOString().slice(0, 10);

  if (isoDate === todayStr)    return "Today";
  if (isoDate === tomorrowStr) return "Tomorrow";

  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
    timeZone: "UTC",
  });
}

// ── Event Row Component ───────────────────────────────────────────────────────
function EventRow({ event }: { event: EconomicEvent }) {
  const impact     = IMPACT_MAP[event.impact];
  const hasFired   = event.actual !== null;
  const isFuture   = new Date(event.event_time) > new Date();

  return (
    <div className={`flex items-start gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02]
      ${event.impact === "high" && isFuture ? "border-l-2 border-rose-500/40" : "border-l-2 border-transparent"}`}
    >
      <div className="flex flex-col items-center gap-1 pt-0.5 w-12 shrink-0">
        <div className={`w-2 h-2 rounded-full ${impact.dot} ${event.impact === "high" && isFuture ? "animate-pulse" : ""}`} />
        <span className={`text-[10px] font-medium ${impact.cls}`}>{impact.label}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-xs font-semibold ${hasFired ? "text-muted-foreground" : "text-foreground"}`}>
              {event.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/8 text-cyan-400 font-mono">
                {event.currency}
              </span>
              <span className="text-[11px] text-muted-foreground/70">
                {formatEventTime(event.event_time)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-right">
            {event.previous !== null && (
              <div>
                <p className="text-[10px] text-muted-foreground/60">Prev</p>
                <p className="text-xs font-mono text-muted-foreground">{event.previous}</p>
              </div>
            )}
            {event.forecast !== null && (
              <div>
                <p className="text-[10px] text-muted-foreground/60">Forecast</p>
                <p className="text-xs font-mono text-foreground">{event.forecast}</p>
              </div>
            )}
            {hasFired && (
              <div>
                <p className="text-[10px] text-muted-foreground/60">Actual</p>
                <p className="text-xs font-mono font-semibold text-emerald-400">{event.actual}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calendar Vector Graphic Component ────────────────────────────────────────
const CalendarGraphic = () => (
  <div className="relative w-48 h-32 shrink-0 flex items-center justify-center">
    {/* Background Glow */}
    <div className="absolute inset-0 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

    {/* Dark Calendar Window Card */}
    <div className="w-40 h-28 rounded-xl bg-slate-900/90 border border-cyan-500/30 p-3 shadow-2xl relative flex flex-col justify-between">
      {/* Calendar Header Rings */}
      <div className="flex justify-between items-center border-b border-white/10 pb-1.5 px-1">
        <div className="w-2 h-2 rounded-full border border-cyan-400/50 bg-cyan-400/20" />
        <div className="w-2 h-2 rounded-full border border-cyan-400/50 bg-cyan-400/20" />
      </div>

      {/* Grid skeleton lines */}
      <div className="grid grid-cols-4 gap-1.5 opacity-40 py-1">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-2 rounded bg-white/10" />
        ))}
      </div>

      {/* Sparkles */}
      <span className="absolute -top-1 -right-1 text-cyan-400 text-xs">✦</span>
      <span className="absolute -bottom-1 -left-1 text-cyan-400 text-xs">✦</span>
    </div>

    {/* Glowing Checkmark Circle Badge */}
    <div className="absolute bottom-2 right-1 w-9 h-9 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-glow-cyan border-2 border-slate-950">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  </div>
);

// ── Main Page Component ───────────────────────────────────────────────────────
export default function EventsPage() {
  const [events, setEvents]           = useState<EconomicEvent[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [daysAhead, setDaysAhead]     = useState(7);
  const [impact, setImpact]           = useState<ImpactLevel | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [alertEnabled, setAlertEnabled] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days_ahead: String(daysAhead) });
      if (impact) params.set("impact", impact);
      const data = await cachedGet<EconomicEvent[]>(`/events?${params}`, 60_000);
      setEvents(data);
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg ?? "Failed to load economic events");
    } finally {
      setLoading(false);
    }
  }, [daysAhead, impact]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const grouped = groupByDate(events);
  const highCount   = events.filter((e) => e.impact === "high").length;
  const medCount    = events.filter((e) => e.impact === "medium").length;
  const lowCount    = events.filter((e) => e.impact === "low").length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] max-w-7xl mx-auto overflow-hidden gap-3">
      {/* ── Top Header Row ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-xl font-bold text-foreground">Economic Calendar</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted-foreground">
              Track upcoming economic events that may impact the markets and your positions.
            </p>
            {lastUpdated && (
              <span className="text-[11px] text-muted-foreground/50">
                · Updated {relativeTime(lastUpdated.toISOString())}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className="surface-card px-3.5 py-1.5 rounded-xl border border-cyan-500/30 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/10 transition-all flex items-center gap-1.5 shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter Settings
        </button>
      </div>

      {/* ── Filter Selector Bar ──────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        {/* Left Impact Filters */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Impact:</span>
          <button
            type="button"
            onClick={() => setImpact(null)}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              impact === null
                ? "bg-cyan-400 text-black shadow-glow-cyan"
                : "bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setImpact("high")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              impact === "high"
                ? "bg-rose-500 text-white shadow-glow"
                : "bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
            }`}
          >
            High
          </button>
          <button
            type="button"
            onClick={() => setImpact("medium")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              impact === "medium"
                ? "bg-amber-500 text-black shadow-glow"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
            }`}
          >
            Medium
          </button>
          <button
            type="button"
            onClick={() => setImpact("low")}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              impact === "low"
                ? "bg-white/20 text-foreground"
                : "bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground"
            }`}
          >
            Low
          </button>
        </div>

        {/* Right Days Ahead Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Days ahead:</span>
          <div className="flex items-center gap-1 p-1 surface-card rounded-xl border border-white/8">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDaysAhead(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  daysAhead === d
                    ? "bg-cyan-400 text-black shadow-glow-cyan"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          <button
            type="button"
            className="w-8 h-8 rounded-xl surface-card border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            </svg>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 shrink-0">
          {error}
        </div>
      )}

      {/* ── Top 4 Stat Cards Grid (Matching reference mockup) ─────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {/* Card 1: High Impact */}
        <div className="surface-card p-3 rounded-xl space-y-1.5 border border-white/6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <p className="text-lg font-bold text-foreground">{highCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">High Impact</p>
            <p className="text-[10px] text-muted-foreground/60">{highCount > 0 ? `${highCount} upcoming` : "No events"}</p>
          </div>
        </div>

        {/* Card 2: Medium Impact */}
        <div className="surface-card p-3 rounded-xl space-y-1.5 border border-white/6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </div>
            <p className="text-lg font-bold text-foreground">{medCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Medium Impact</p>
            <p className="text-[10px] text-muted-foreground/60">{medCount > 0 ? `${medCount} upcoming` : "No events"}</p>
          </div>
        </div>

        {/* Card 3: Low Impact */}
        <div className="surface-card p-3 rounded-xl space-y-1.5 border border-white/6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <p className="text-lg font-bold text-foreground">{lowCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Low Impact</p>
            <p className="text-[10px] text-muted-foreground/60">{lowCount > 0 ? `${lowCount} upcoming` : "No events"}</p>
          </div>
        </div>

        {/* Card 4: Total Events */}
        <div className="surface-card p-3 rounded-xl space-y-1.5 border border-white/6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-lg font-bold text-foreground">{events.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Total Events</p>
            <p className="text-[10px] text-muted-foreground/60">Next {daysAhead} days</p>
          </div>
        </div>
      </div>

      {/* ── Main Content Area: Event List OR Reference Empty State Card ─────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="surface-card p-6 rounded-2xl border border-white/8 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          /* Reference Mockup Empty State Box */
          <div className="surface-card p-6 rounded-2xl border border-white/8 flex flex-col md:flex-row items-center justify-between gap-4 relative overflow-hidden h-full">
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 my-2">
              <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-muted-foreground shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-foreground">No upcoming events</h3>
              <p className="text-xs text-muted-foreground/70 max-w-sm">
                Check back soon — events are updated every hour.
              </p>
            </div>

            <CalendarGraphic />
          </div>
        ) : (
          /* Render Real Events grouped by Date */
          <div className="space-y-3">
            {Array.from(grouped.entries()).map(([date, dayEvents]) => (
              <div key={date} className="surface-card rounded-2xl overflow-hidden border border-white/8">
                <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">{dayLabel(date)}</p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {dayEvents.filter((e) => e.impact === "high").length} high-impact · {dayEvents.length} total
                  </p>
                </div>
                <div className="divide-y divide-white/4">
                  {[...dayEvents]
                    .sort((a, b) => {
                      const order = { high: 0, medium: 1, low: 2 };
                      return order[a.impact] - order[b.impact];
                    })
                    .map((e) => (
                      <EventRow key={e.id} event={e} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── "About Economic Events" Card Section ─────────────────────────── */}
      <div className="surface-card p-3.5 rounded-2xl border border-white/8 space-y-2 shrink-0">
        <div>
          <h2 className="text-[11px] font-semibold text-foreground uppercase tracking-wider">About Economic Events</h2>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            High impact events can cause increased volatility and may affect your open positions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Feature 1 */}
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">Stay Informed</h3>
              <p className="text-[10px] text-muted-foreground/70 leading-snug">
                Track important economic releases from around the world.
              </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">Plan Ahead</h3>
              <p className="text-[10px] text-muted-foreground/70 leading-snug">
                Prepare your trading strategy around high-impact events.
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="flex items-start gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground">Manage Risk</h3>
              <p className="text-[10px] text-muted-foreground/70 leading-snug">
                Reduce risk exposure during volatile market conditions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Alert Banner Card ─────────────────────────────────────── */}
      <div className="surface-card p-3.5 rounded-2xl border border-cyan-500/20 shadow-glow-cyan flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold text-foreground">Never miss important events</h3>
            <p className="text-[10px] text-muted-foreground/70">
              Enable notifications to get alerted before high-impact events.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            setAlertEnabled((v) => !v);
            alert(!alertEnabled ? "Notifications enabled for high-impact events!" : "Alerts disabled.");
          }}
          className={`px-3.5 py-2 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5 shrink-0 ${
            alertEnabled
              ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-400"
              : "bg-cyan-400 hover:bg-cyan-300 text-black shadow-glow-cyan"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
