"use client";
// src/app/(app)/events/page.tsx
// AlgoFin v1 — Economic Calendar (Phase F)
//
// plan.md Section 7 — label rules:
//   CORRECT: "Economic Calendar" / "Upcoming High-Impact Events"
//   NEVER:   "News Feed" / "Live Market Intelligence" / "AI-Powered News Feed"

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import type { EconomicEvent, ImpactLevel } from "@/types/events";
import { relativeTime } from "@/lib/staleness";

// ── Helpers ───────────────────────────────────────────────────────
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

// ── Impact filter chip ─────────────────────────────────────────────
function FilterChip({
  label,
  active,
  color,
  onClick,
}: {
  label:   string;
  active:  boolean;
  color:   string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
        ${active
          ? `${color} border-current bg-current/10`
          : "text-muted-foreground border-white/8 hover:border-white/20 hover:text-foreground"
        }`}
    >
      {label}
    </button>
  );
}

// ── Event row ─────────────────────────────────────────────────────
function EventRow({ event }: { event: EconomicEvent }) {
  const impact     = IMPACT_MAP[event.impact];
  const hasFired   = event.actual !== null;
  const isFuture   = new Date(event.event_time) > new Date();

  return (
    <div className={`flex items-start gap-4 px-4 py-3 transition-colors hover:bg-white/2
      ${event.impact === "high" && isFuture ? "border-l-2 border-rose-500/40" : "border-l-2 border-transparent"}`}
    >
      {/* Impact indicator */}
      <div className="flex flex-col items-center gap-1 pt-0.5 w-12 shrink-0">
        <div className={`w-2 h-2 rounded-full ${impact.dot} ${event.impact === "high" && isFuture ? "animate-pulse" : ""}`} />
        <span className={`text-[10px] font-medium ${impact.cls}`}>{impact.label}</span>
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={`text-sm font-medium ${hasFired ? "text-muted-foreground" : "text-foreground"}`}>
              {event.title}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground font-mono">
                {event.currency}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatEventTime(event.event_time)}
              </span>
            </div>
          </div>

          {/* Forecast / actual */}
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
                <p className="text-xs font-mono font-semibold text-primary">{event.actual}</p>
              </div>
            )}
            {!hasFired && event.forecast === null && (
              <span className="text-[10px] text-muted-foreground/40">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="surface-card p-10 text-center space-y-2">
      <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground">
        {hasFilters ? "No events matching your filters" : "No upcoming events"}
      </p>
      <p className="text-xs text-muted-foreground">
        {hasFilters ? "Try adjusting impact level or date range." : "Check back soon — events are refreshed every hour."}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function EventsPage() {
  const [events, setEvents]       = useState<EconomicEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [daysAhead, setDaysAhead] = useState(7);
  const [impact, setImpact]       = useState<ImpactLevel | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days_ahead: String(daysAhead) });
      if (impact) params.set("impact", impact);
      const res = await api.get<{ data: EconomicEvent[] }>(`/events/?${params}`);
      setEvents(res.data.data);
      setLastUpdated(new Date());
    } catch {
      setError("Failed to load economic events. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }, [daysAhead, impact]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const grouped = groupByDate(events);
  const highCount = events.filter((e) => e.impact === "high").length;
  const hasFilters = impact !== null;

  return (
    <div className="p-6 max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Economic Calendar</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              Upcoming macro events affecting your positions
            </p>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground/50">
                · Updated {relativeTime(lastUpdated.toISOString())}
              </span>
            )}
          </div>
        </div>
        {highCount > 0 && (
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            {highCount} high-impact
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Impact:</span>
        <FilterChip label="All"    active={impact === null} color="text-foreground"   onClick={() => setImpact(null)} />
        <FilterChip label="High"   active={impact === "high"}   color="text-rose-400"  onClick={() => setImpact("high")} />
        <FilterChip label="Medium" active={impact === "medium"} color="text-amber-400" onClick={() => setImpact("medium")} />
        <FilterChip label="Low"    active={impact === "low"}    color="text-muted-foreground" onClick={() => setImpact("low")} />

        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Days ahead:</span>
          {[3, 7, 14].map((d) => (
            <button
              key={d}
              onClick={() => setDaysAhead(d)}
              className={`px-2.5 py-1 rounded-lg border text-xs transition-all
                ${daysAhead === d
                  ? "border-primary/40 text-primary bg-primary/10"
                  : "border-white/8 hover:border-white/20 hover:text-foreground"
                }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-400">
          {error}
        </div>
      )}

      {/* Events */}
      {loading ? (
        <div className="surface-card divide-y divide-white/5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-4 px-4 py-3 animate-pulse">
              <div className="w-12 space-y-1">
                <div className="w-2 h-2 rounded-full bg-muted/30 mx-auto" />
                <div className="h-2 w-10 bg-muted/20 rounded" />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 bg-muted/30 rounded" />
                <div className="h-2.5 w-1/3 bg-muted/20 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([date, dayEvents]) => (
            <div key={date} className="surface-card overflow-hidden">
              {/* Day header */}
              <div className="px-4 py-2.5 border-b border-white/5 bg-white/2">
                <p className="text-sm font-semibold text-foreground">{dayLabel(date)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {dayEvents.filter((e) => e.impact === "high").length} high-impact
                  {" · "}
                  {dayEvents.length} total
                </p>
              </div>
              {/* Sorted: high impact first */}
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
  );
}
