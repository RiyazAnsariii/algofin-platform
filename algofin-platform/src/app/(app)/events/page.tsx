"use client";
// src/app/(app)/events/page.tsx
// AlgoFin — Economic Calendar (ForexFactory Dark Theme UI)

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import api from "@/lib/api";
import { cachedGet } from "@/lib/apiCache";
import type { EconomicEvent, ImpactLevel } from "@/types/events";
import { relativeTime } from "@/lib/staleness";

// ── Currency Flags & Icons ───────────────────────────────────────────────────
const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  JPY: "🇯🇵",
  AUD: "🇦🇺",
  CAD: "🇨🇦",
  CNY: "🇨🇳",
  CHF: "🇨🇭",
  NZD: "🇳🇿",
};

// ── Impact Styling ────────────────────────────────────────────────────────────
const IMPACT_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; folderBg: string; folderFill: string; folderColor: string }
> = {
  high: {
    label: "High",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
    folderBg: "bg-red-500",
    folderFill: "#ef4444",
    folderColor: "text-red-400 hover:bg-red-500/20 border-red-500/30",
  },
  High: {
    label: "High",
    bg: "bg-red-500/15",
    text: "text-red-400",
    border: "border-red-500/30",
    folderBg: "bg-red-500",
    folderFill: "#ef4444",
    folderColor: "text-red-400 hover:bg-red-500/20 border-red-500/30",
  },
  medium: {
    label: "Medium",
    bg: "bg-[#7c2d12]/30",
    text: "text-[#f97316]",
    border: "border-[#9a3412]/50",
    folderBg: "bg-[#b45309]",
    folderFill: "#b45309",
    folderColor: "text-[#d97706] hover:bg-[#b45309]/20 border-[#b45309]/30",
  },
  Medium: {
    label: "Medium",
    bg: "bg-[#7c2d12]/30",
    text: "text-[#f97316]",
    border: "border-[#9a3412]/50",
    folderBg: "bg-[#b45309]",
    folderFill: "#b45309",
    folderColor: "text-[#d97706] hover:bg-[#b45309]/20 border-[#b45309]/30",
  },
  low: {
    label: "Low",
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    folderBg: "bg-yellow-400",
    folderFill: "#eab308",
    folderColor: "text-yellow-400 hover:bg-yellow-500/20 border-yellow-500/30",
  },
  Low: {
    label: "Low",
    bg: "bg-yellow-500/15",
    text: "text-yellow-400",
    border: "border-yellow-500/30",
    folderBg: "bg-yellow-400",
    folderFill: "#eab308",
    folderColor: "text-yellow-400 hover:bg-yellow-500/20 border-yellow-500/30",
  },
};

// ── Non-ForexFactory Event Blacklist ──────────────────────────────────────────
function isBlacklistedFrontend(title: string, currency?: string): boolean {
  if (!title) return false;
  const tClean = title.trim();
  const tLower = tClean.toLowerCase();
  const curr = (currency || "").trim().toUpperCase();

  const exactMatches = [
    "export prices q/q",
    "spanish prelim cpi m/m",
    "spanish prelim core cpi y/y",
    "spanish flash gdp y/y",
    "german flash gdp y/y",
    "italian advance gdp y/y",
    "eurozone flash gdp y/y",
    "italian unemployment rate",
    "boe mpc vote unchanged",
    "boe mpc vote hike",
    "boe mpc vote cut",
    "core pce prices q/q advance",
    "core pce price index y/y",
    "pce prices q/q advance",
    "pce price index m/m",
    "pce price index y/y",
    "boe gov bailey speaks",
    "eia natural gas stocks change",
  ];

  if (exactMatches.includes(tLower)) return true;
  if (tLower.includes("gdp y/y")) return true;
  if (tLower.includes("export prices")) return true;
  if (tLower.includes("spanish prelim") || tLower.includes("spanish flash gdp")) return true;
  if (tLower.includes("mpc vote")) return true;
  if (tLower.includes("pce")) {
    if (tLower.includes("q/q") || tLower.includes("y/y") || (tLower.endsWith("index m/m") && !tLower.includes("core"))) {
      return true;
    }
  }
  if (tLower.includes("natural gas stocks change")) return true;
  if (tLower === "consumer confidence" || tLower.endsWith(" consumer confidence")) return true;
  if (tLower === "ppi m/m" || (tLower.includes("ppi m/m") && curr !== "USD")) return true;
  if (tLower === "cpi y/y" || tLower === "cpi m/m" || (["cpi y/y", "cpi m/m"].includes(tLower) && curr === "EUR")) return true;
  if (tLower.includes("retail sales m/m") && (curr === "EUR" || tLower === "retail sales m/m")) return true;
  if (tLower === "italian unemployment rate") return true;
  if (tLower.includes("bailey speaks")) return true;

  return false;
}

function isForcedHighImpactFrontend(title: string): boolean {
  if (!title) return false;
  const tLower = title.trim().toLowerCase();
  const highImpactKeywords = [
    "boe monetary policy report",
    "monetary policy summary",
    "mpc official bank rate votes",
    "official bank rate",
    "advance gdp q/q",
    "core pce price index m/m",
    "fomc press conference",
    "fomc statement",
    "federal funds rate",
    "boj policy rate",
    "boj interest rate decision",
    "boj outlook report",
    "boj quarterly outlook report",
    "boj press conference",
    "boj gov ueda speaks",
    "monetary policy statement",
    "gdp m/m",
    "ism manufacturing pmi",
    "nz unemployment rate",
    "employment change q/q",
    "non-farm employment change",
    "nonfarm payrolls",
  ];
  return highImpactKeywords.some((kw) => tLower.includes(kw));
}

function isForcedMediumImpactFrontend(title: string, currency?: string): boolean {
  if (!title) return false;
  const tLower = title.trim().toLowerCase();
  const curr = (currency || "").trim().toUpperCase();
  if (curr === "CHF" && tLower.includes("cpi m/m")) return true;

  const mediumImpactKeywords = [
    "tokyo core cpi",
    "core cpi flash estimate",
    "cpi flash estimate",
    "employment cost index",
    "chicago pmi",
    "ism manufacturing prices",
    "jolts job openings",
    "adp non-farm employment change",
    "adp employment change",
    "ism services pmi",
    "german prelim cpi m/m",
    "german prelim gdp q/q",
    "advance gdp price index",
    "revised uom consumer sentiment",
    "revised uom inflation expectations",
    "michigan consumer sentiment",
    "michigan 5 year inflation expectations",
    "unemployment claims",
  ];
  return mediumImpactKeywords.some((kw) => tLower.includes(kw));
}

// ── Exact ForexFactory Events Generator ───────────────────────────
function generateFallbackEvents(): EconomicEvent[] {
  const now = new Date();

  const ffEvents = [
    // Today (Sat Jul 25) - Matching User ForexFactory Image 1
    {
      title: "President Trump Speaks",
      currency: "USD",
      country: "United States",
      impact: "medium" as ImpactLevel,
      dayOffset: 0,
      hour: 6,
      minute: 25,
      actual: null,
      forecast: null,
      previous: null,
      source: "White House / ForexFactory",
    },
    {
      title: "Flash Manufacturing PMI",
      currency: "USD",
      country: "United States",
      impact: "high" as ImpactLevel,
      dayOffset: 0,
      hour: 19,
      minute: 15,
      actual: "53.8",
      forecast: "54.4",
      previous: "53.9",
      source: "S&P Global",
    },
    {
      title: "Flash Services PMI",
      currency: "USD",
      country: "United States",
      impact: "high" as ImpactLevel,
      dayOffset: 0,
      hour: 19,
      minute: 15,
      actual: "53.6",
      forecast: "51.3",
      previous: "51.2",
      source: "S&P Global",
    },
    {
      title: "New Home Sales",
      currency: "USD",
      country: "United States",
      impact: "medium" as ImpactLevel,
      dayOffset: 0,
      hour: 19,
      minute: 30,
      actual: "628K",
      forecast: "609K",
      previous: "618K",
      source: "U.S. Census Bureau",
    },
    // Yesterday (Fri Jul 24) - Matching User ForexFactory Image 2
    {
      title: "Treasury Currency Report",
      currency: "USD",
      country: "United States",
      impact: "low" as ImpactLevel,
      dayOffset: -1,
      hour: 1,
      minute: 30,
      actual: null,
      forecast: null,
      previous: null,
      source: "U.S. Department of the Treasury",
    },
    {
      title: "Flash Manufacturing PMI",
      currency: "USD",
      country: "United States",
      impact: "medium" as ImpactLevel,
      dayOffset: -1,
      hour: 19,
      minute: 15,
      actual: "53.8",
      forecast: "54.4",
      previous: "53.9",
      source: "S&P Global",
    },
    {
      title: "Flash Services PMI",
      currency: "USD",
      country: "United States",
      impact: "medium" as ImpactLevel,
      dayOffset: -1,
      hour: 19,
      minute: 15,
      actual: "53.6",
      forecast: "51.3",
      previous: "51.2",
      source: "S&P Global",
    },
    {
      title: "New Home Sales",
      currency: "USD",
      country: "United States",
      impact: "medium" as ImpactLevel,
      dayOffset: -1,
      hour: 19,
      minute: 30,
      actual: "628K",
      forecast: "609K",
      previous: "618K",
      source: "U.S. Census Bureau",
    },
    // Upcoming Days
    {
      title: "US Core CPI m/m",
      currency: "USD",
      country: "United States",
      impact: "high" as ImpactLevel,
      dayOffset: 1,
      hour: 12,
      minute: 30,
      actual: null,
      forecast: "0.3%",
      previous: "0.3%",
      source: "U.S. Bureau of Labor Statistics",
    },
    {
      title: "Fed Interest Rate Decision",
      currency: "USD",
      country: "United States",
      impact: "high" as ImpactLevel,
      dayOffset: 2,
      hour: 18,
      minute: 0,
      actual: null,
      forecast: "5.25%",
      previous: "5.25%",
      source: "Federal Reserve",
    },
    {
      title: "German Flash Manufacturing PMI",
      currency: "EUR",
      country: "Eurozone",
      impact: "high" as ImpactLevel,
      dayOffset: 2,
      hour: 8,
      minute: 30,
      actual: null,
      forecast: "43.5",
      previous: "42.8",
      source: "S&P Global",
    },
  ];

  return ffEvents.map((item, idx) => {
    const eventDate = new Date(now);
    eventDate.setDate(now.getDate() + item.dayOffset);
    eventDate.setHours(item.hour, item.minute, 0, 0);

    return {
      id: `ff-event-${idx + 1}`,
      title: item.title,
      currency: item.currency,
      country: item.country,
      impact: item.impact,
      event_time: eventDate.toISOString(),
      forecast: item.forecast,
      previous: item.previous,
      actual: item.actual,
      source: item.source,
      status: "Upcoming",
      last_updated_at: now.toISOString(),
      fetched_at: now.toISOString(),
      is_stale: false,
    };
  });
}

// ── Time & Date Formatters ───────────────────────────────────────────────────
function formatTimeOnly(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).toLowerCase();
}

function formatDateHeader(isoDateStr: string): string {
  const d = new Date(isoDateStr + "T00:00:00Z");
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrowStr = new Date(now.getTime() + 86400_000).toISOString().slice(0, 10);

  const formattedStr = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  if (isoDateStr === todayStr) return `Today: ${formattedStr}`;
  if (isoDateStr === tomorrowStr) return `Tomorrow: ${formattedStr}`;

  return formattedStr;
}

// ── Main Page Component ───────────────────────────────────────────────────────
export default function EventsPage() {
  const [events, setEvents] = useState<EconomicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [daysAhead, setDaysAhead] = useState(30);
  const [selectedImpact, setSelectedImpact] = useState<ImpactLevel | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Date Navigation State (Active Selected View Date)
  const [viewDate, setViewDate] = useState<Date>(new Date());

  // Forex Factory Style Date Range Picker Modal State
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerTempDate, setPickerTempDate] = useState<Date>(new Date());
  const [pickerMonthOffset, setPickerMonthOffset] = useState<number>(0);

  // Interactivity States
  const [alertMap, setAlertMap] = useState<Record<string, boolean>>({});
  const [activeModalEvent, setActiveModalEvent] = useState<EconomicEvent | null>(null);
  const [modalTab, setModalTab] = useState<"detail" | "graph">("detail");

  const [summaryData, setSummaryData] = useState<{ high: number; medium: number; low: number; total: number }>({
    high: 0,
    medium: 0,
    low: 0,
    total: 0,
  });
  const [dataAgeMinutes, setDataAgeMinutes] = useState<number>(0);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(daysAhead) });
      if (selectedImpact) params.set("impact", selectedImpact);
      if (selectedCurrency && selectedCurrency !== "ALL") params.set("currency", selectedCurrency);
      if (searchQuery.trim()) params.set("search", searchQuery.trim());

      // NOTE: api baseURL is already /api/v1 — do NOT repeat it here
      const res = await api.get<{
        events: EconomicEvent[];
        summary: { high: number; medium: number; low: number; total: number };
        metadata: { provider: string; cached: boolean; data_age_minutes: number; total_results: number };
      }>(`/economic-calendar?${params}`);

      const data = res.data;
      if (data && data.events) {
        const cleanEvents = data.events
          .filter((e) => !isBlacklistedFrontend(e.title, e.currency))
          .map((e) =>
            isForcedHighImpactFrontend(e.title)
              ? { ...e, impact: "High" as ImpactLevel }
              : e
          );
        setEvents(cleanEvents);
        if (data.summary) setSummaryData(data.summary);
        if (data.metadata) setDataAgeMinutes(data.metadata.data_age_minutes || 0);
      } else {
        setError("No events data returned from server.");
        setEvents([]);
      }
      setLastUpdated(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load events: ${message}`);
      setEvents([]);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [daysAhead, selectedImpact, selectedCurrency, searchQuery]);


  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Single Day Events Filter for the active viewDate & active currency / search / impact filters
  const singleDayEvents = useMemo(() => {
    const targetY = viewDate.getFullYear();
    const targetM = viewDate.getMonth();
    const targetD = viewDate.getDate();

    return events.filter((e) => {
      const dt = new Date(e.event_time);
      const isSameDate =
        dt.getFullYear() === targetY &&
        dt.getMonth() === targetM &&
        dt.getDate() === targetD;
      const isSameCurrency =
        selectedCurrency === "ALL" || e.currency?.toUpperCase() === selectedCurrency.toUpperCase();
      const isSameImpact =
        !selectedImpact || e.impact?.toLowerCase() === selectedImpact.toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.currency.toLowerCase().includes(searchQuery.toLowerCase());

      return isSameDate && isSameCurrency && isSameImpact && matchesSearch;
    });
  }, [events, viewDate, selectedCurrency, selectedImpact, searchQuery]);

  // All events for the active viewDate & active currency/search filter (for impact card count breakdown)
  const singleDayAllEvents = useMemo(() => {
    const targetY = viewDate.getFullYear();
    const targetM = viewDate.getMonth();
    const targetD = viewDate.getDate();

    return events.filter((e) => {
      const dt = new Date(e.event_time);
      const isSameDate =
        dt.getFullYear() === targetY &&
        dt.getMonth() === targetM &&
        dt.getDate() === targetD;
      const isSameCurrency =
        selectedCurrency === "ALL" || e.currency?.toUpperCase() === selectedCurrency.toUpperCase();
      const matchesSearch =
        !searchQuery.trim() ||
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.currency.toLowerCase().includes(searchQuery.toLowerCase());

      return isSameDate && isSameCurrency && matchesSearch;
    });
  }, [events, viewDate, selectedCurrency, searchQuery]);

  // Date Header Label (Today, Yesterday, Tomorrow, or Formatted Date)
  const viewDateLabel = useMemo(() => {
    const now = new Date();
    const targetY = viewDate.getFullYear();
    const targetM = viewDate.getMonth();
    const targetD = viewDate.getDate();

    const isToday =
      now.getFullYear() === targetY &&
      now.getMonth() === targetM &&
      now.getDate() === targetD;

    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const isYesterday =
      yesterday.getFullYear() === targetY &&
      yesterday.getMonth() === targetM &&
      yesterday.getDate() === targetD;

    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const isTomorrow =
      tomorrow.getFullYear() === targetY &&
      tomorrow.getMonth() === targetM &&
      tomorrow.getDate() === targetD;

    const formattedDate = viewDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    if (isToday) return `Today: ${formattedDate}`;
    if (isYesterday) return `Yesterday: ${formattedDate}`;
    if (isTomorrow) return `Tomorrow: ${formattedDate}`;
    return formattedDate;
  }, [viewDate]);

  const MONTH_NAMES = useMemo(() => [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ], []);

  const leftMonthDate = useMemo(() => {
    return new Date(pickerTempDate.getFullYear(), pickerTempDate.getMonth() + pickerMonthOffset, 1);
  }, [pickerTempDate, pickerMonthOffset]);

  const rightMonthDate = useMemo(() => {
    return new Date(pickerTempDate.getFullYear(), pickerTempDate.getMonth() + pickerMonthOffset + 1, 1);
  }, [pickerTempDate, pickerMonthOffset]);

  const leftMonthDays = useMemo(() => {
    const year = leftMonthDate.getFullYear();
    const month = leftMonthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(d);
    return days;
  }, [leftMonthDate]);

  const rightMonthDays = useMemo(() => {
    const year = rightMonthDate.getFullYear();
    const month = rightMonthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(d);
    return days;
  }, [rightMonthDate]);

  const handleOpenDatePicker = () => {
    setPickerTempDate(new Date(viewDate));
    setPickerMonthOffset(0);
    setIsDatePickerOpen(true);
  };

  const handleQuickPreset = (preset: "this_week" | "next_week" | "this_month" | "next_month") => {
    const now = new Date();
    if (preset === "this_week") {
      setPickerTempDate(now);
    } else if (preset === "next_week") {
      const nextWk = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
      setPickerTempDate(nextWk);
    } else if (preset === "this_month") {
      const thisMo = new Date(now.getFullYear(), now.getMonth(), 1);
      setPickerTempDate(thisMo);
    } else if (preset === "next_month") {
      const nextMo = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      setPickerTempDate(nextMo);
    }
  };

  // Dynamic stats calculated specifically for the currently selected date (viewDate)
  const highCount = useMemo(
    () => singleDayAllEvents.filter((e) => e.impact?.toLowerCase() === "high").length,
    [singleDayAllEvents]
  );
  const medCount = useMemo(
    () => singleDayAllEvents.filter((e) => e.impact?.toLowerCase() === "medium").length,
    [singleDayAllEvents]
  );
  const lowCount = useMemo(
    () => singleDayAllEvents.filter((e) => e.impact?.toLowerCase() === "low").length,
    [singleDayAllEvents]
  );
  const totalCount = singleDayAllEvents.length;

  // Up Next Event
  const nextEvent = useMemo(() => {
    const future = events.filter((e) => new Date(e.event_time) > new Date());
    return future[0] || events[0];
  }, [events]);

  const toggleAlert = (id: string, eTitle: string) => {
    const curr = alertMap[id];
    setAlertMap((prev) => ({ ...prev, [id]: !curr }));
  };

  const handlePrevDay = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
  };
  const handleNextDay = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
  };
  const handleResetToday = () => {
    setViewDate(new Date());
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12 font-sans text-foreground">
      {/* ── Header Title & Refresh Status ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Economic Calendar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track high-impact macroeconomic events, interest rate decisions, and market catalysts.
            {dataAgeMinutes > 0 ? (
              <span className="text-emerald-400/80 font-medium ml-2">
                · Sync fresh ({dataAgeMinutes}m ago)
              </span>
            ) : lastUpdated ? (
              <span className="text-muted-foreground/60 ml-2">
                · Updated {relativeTime(lastUpdated.toISOString())}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Currency Filter Pills — 8 Major Forex Currencies */}
          <div className="flex items-center gap-1 flex-wrap bg-[#121620] border border-white/10 rounded-xl p-1 text-xs">
            {["ALL", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNY"].map((curr) => (
              <button
                key={curr}
                type="button"
                onClick={() => setSelectedCurrency(curr)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  selectedCurrency === curr
                    ? "bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {curr === "ALL" ? "All Currencies" : `${CURRENCY_FLAGS[curr] || ""} ${curr}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4 Top Overview Stat Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-[#121620] p-3.5 rounded-2xl border border-white/8 space-y-1.5 hover:border-white/15 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              High Impact
            </span>
            <span className="text-xl font-bold text-foreground">{highCount}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70">Major market movers & volatility drivers</p>
        </div>

        <div className="bg-[#121620] p-3.5 rounded-2xl border border-white/8 space-y-1.5 hover:border-white/15 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Medium Impact
            </span>
            <span className="text-xl font-bold text-foreground">{medCount}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70">Secondary data releases & speeches</p>
        </div>

        <div className="bg-[#121620] p-3.5 rounded-2xl border border-white/8 space-y-1.5 hover:border-white/15 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Low Impact
            </span>
            <span className="text-xl font-bold text-foreground">{lowCount}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70">Routine statistical reports</p>
        </div>

        <div className="bg-[#121620] p-3.5 rounded-2xl border border-white/8 space-y-1.5 hover:border-white/15 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
              Total Scheduled
            </span>
            <span className="text-xl font-bold text-foreground">{totalCount}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/70">Events for selected date</p>
        </div>
      </div>

      {/* ── ForexFactory-Style Dark Table Container ───────────────────────── */}
      <div className="bg-[#0f121a] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
        {/* Table Top Navigation & Filter Bar (Matching Image 2 Header) */}
        <div className="bg-[#181d29] border-b border-white/10 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Left Date Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-black/40 border border-white/10 rounded-xl overflow-hidden shadow-inner">
              <button
                type="button"
                onClick={handlePrevDay}
                className="px-3 py-1.5 hover:bg-white/10 text-muted-foreground hover:text-cyan-400 font-bold transition-colors border-r border-white/10"
                title="Previous Day (◀)"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={handleOpenDatePicker}
                className="px-4 py-1.5 font-bold text-foreground bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 transition-all flex items-center gap-2 cursor-pointer"
                title="Click to open Date Range Calendar Picker"
              >
                <span>{viewDateLabel}</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-emerald-300 shadow-sm" />
              </button>
              <button
                type="button"
                onClick={handleNextDay}
                className="px-3 py-1.5 hover:bg-white/10 text-muted-foreground hover:text-cyan-400 font-bold transition-colors border-l border-white/10"
                title="Next Day (▶)"
              >
                ▶
              </button>
            </div>
          </div>

          {/* Center Next Up Badge */}
          {nextEvent && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[11px] font-medium">
              <span className="font-bold text-cyan-400 uppercase tracking-wider">▶ Up Next:</span>
              <span className="font-semibold text-foreground">{nextEvent.title}</span>
              <span className="font-mono text-muted-foreground">({formatTimeOnly(nextEvent.event_time)})</span>
            </div>
          )}

          {/* Right Search & Filters */}
          <div className="flex items-center gap-2.5 flex-1 max-w-xs sm:flex-initial">
            {/* Search Input */}
            <div className="relative w-full sm:w-48">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Events..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-1.5 pl-8 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-cyan-400/50 transition-all"
              />
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="absolute left-2.5 top-2 text-muted-foreground/60"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            {/* Impact Filter Dropdown */}
            <select
              value={selectedImpact || ""}
              onChange={(e) => setSelectedImpact((e.target.value as ImpactLevel) || null)}
              className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-foreground outline-none cursor-pointer"
            >
              <option value="" className="bg-[#181d29]">All Impacts</option>
              <option value="high" className="bg-[#181d29]">High Only</option>
              <option value="medium" className="bg-[#181d29]">Medium Only</option>
              <option value="low" className="bg-[#181d29]">Low Only</option>
            </select>
          </div>
        </div>

        {/* ── Main Economic Table (ForexFactory Dark Spec) ──────────────────── */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-sans">
            <thead>
              <tr className="bg-[#141822] text-muted-foreground/80 font-bold border-b border-white/10 uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-4 w-28">Date</th>
                <th className="py-2.5 px-3 w-20">Time</th>
                <th className="py-2.5 px-3 w-16 text-center">Cur.</th>
                <th className="py-2.5 px-3 w-20 text-center">Impact</th>
                <th className="py-2.5 px-4">Event</th>
                <th className="py-2.5 px-2 text-center w-12" title="Set Alert">Alerts</th>
                <th className="py-2.5 px-2 text-center w-12" title="Event Details">Detail</th>
                <th className="py-2.5 px-3 text-right w-24">Actual</th>
                <th className="py-2.5 px-3 text-right w-24">Forecast</th>
                <th className="py-2.5 px-3 text-right w-24">Previous</th>
                <th className="py-2.5 px-3 text-center w-14">Graph</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground space-y-2">
                    <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs">Loading Economic Calendar...</p>
                  </td>
                </tr>
              ) : singleDayEvents.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-muted-foreground">
                    <p className="text-sm font-semibold text-foreground mb-1">
                      No scheduled events for {viewDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Use the ◀ and ▶ buttons above to navigate dates.
                    </p>
                  </td>
                </tr>
              ) : (
                <>
                  {/* Single Day Header Row */}
                  <tr className="bg-[#121620]/90 text-cyan-400 font-bold border-y border-white/8 text-[11px]">
                    <td colSpan={11} className="py-1.5 px-4">
                      <div className="flex items-center justify-between">
                        <span>
                          {viewDate.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 font-normal">
                          {singleDayEvents.length} scheduled event{singleDayEvents.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </td>
                  </tr>
                  {/* Event Rows for Selected Single Day */}
                      const effectiveImpact = isForcedHighImpactFrontend(evt.title)
                        ? "high"
                        : (isForcedMediumImpactFrontend(evt.title, evt.currency)
                            ? "medium"
                            : ((evt.impact || "low").toLowerCase() as ImpactLevel));
                      const impactCfg = IMPACT_CONFIG[effectiveImpact] || IMPACT_CONFIG.low;
                      const isAlertOn = alertMap[evt.id];
                      const isActualBetter =
                        evt.actual && evt.forecast && parseFloat(evt.actual) > parseFloat(evt.forecast);
                      const isActualWorse =
                        evt.actual && evt.forecast && parseFloat(evt.actual) < parseFloat(evt.forecast);

                      return (
                        <tr
                          key={evt.id}
                          className="hover:bg-white/[0.03] transition-colors group border-b border-white/[0.04]"
                        >
                          {/* Date */}
                          <td className="py-2.5 px-4 text-muted-foreground/80 font-medium text-[11px] whitespace-nowrap w-28">
                            {new Date(evt.event_time).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </td>

                          {/* Time */}
                          <td className="py-2.5 px-3 font-mono text-muted-foreground font-semibold whitespace-nowrap text-[11px] w-20">
                            {formatTimeOnly(evt.event_time)}
                          </td>

                          {/* Currency */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap w-16">
                            <span className="inline-flex items-center gap-1 font-bold text-foreground bg-white/5 border border-white/10 px-2 py-0.5 rounded-md font-mono text-[10px]">
                              <span>{CURRENCY_FLAGS[evt.currency] || "🌐"}</span>
                              <span>{evt.currency}</span>
                            </span>
                          </td>

                          {/* Impact */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap w-20">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] border ${impactCfg.bg} ${impactCfg.text} ${impactCfg.border}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${impactCfg.folderBg}`} />
                              <span>{impactCfg.label}</span>
                            </span>
                          </td>

                          {/* Event Title */}
                          <td className="py-2.5 px-4 font-semibold text-foreground group-hover:text-cyan-300 transition-colors">
                            <div className="flex items-center gap-2">
                              <span>{evt.title}</span>
                              {evt.status === "Ongoing" && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                  Live
                                </span>
                              )}
                              {evt.status === "Completed" && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase tracking-wider bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20">
                                  Done
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Alerts Toggle */}
                          <td className="py-2.5 px-2 text-center w-12">
                            <button
                              type="button"
                              onClick={() => toggleAlert(evt.id, evt.title)}
                              className={`p-1 rounded-lg transition-all ${
                                isAlertOn
                                  ? "text-amber-400 bg-amber-500/20 border border-amber-500/30"
                                  : "text-muted-foreground/50 hover:text-foreground hover:bg-white/10"
                              }`}
                              title={isAlertOn ? "Alert active (15m before)" : "Set alert"}
                            >
                              🔔
                            </button>
                          </td>

                          {/* Detail Modal Trigger */}
                          <td className="py-2.5 px-2 text-center w-12">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveModalEvent(evt);
                                setModalTab("detail");
                              }}
                              className={`p-1 rounded-lg border transition-all flex items-center justify-center mx-auto ${impactCfg.folderColor}`}
                              title={`View Details (${impactCfg.label} Impact)`}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill={impactCfg.folderFill}
                                stroke="currentColor"
                                strokeWidth="1.5"
                              >
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                              </svg>
                            </button>
                          </td>

                          {/* Actual */}
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-[11px] whitespace-nowrap w-24">
                            {evt.actual !== null ? (
                              <span
                                className={
                                  isActualBetter
                                    ? "text-emerald-400"
                                    : isActualWorse
                                    ? "text-rose-400"
                                    : "text-foreground"
                                }
                              >
                                {evt.actual}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 font-normal">--</span>
                            )}
                          </td>

                          {/* Forecast */}
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground/90 font-medium text-[11px] whitespace-nowrap w-24">
                            {evt.forecast ?? "--"}
                          </td>

                          {/* Previous */}
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground/70 text-[11px] whitespace-nowrap w-24">
                            {evt.previous ? (
                              <span>
                                {evt.previous}
                                {isActualBetter && <span className="text-emerald-400 ml-1">▲</span>}
                                {isActualWorse && <span className="text-rose-400 ml-1">▼</span>}
                              </span>
                            ) : (
                              "--"
                            )}
                          </td>

                          {/* Graph Modal Trigger */}
                          <td className="py-2.5 px-3 text-center w-14">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveModalEvent(evt);
                                setModalTab("graph");
                              }}
                              className="p-1 rounded-lg text-cyan-400/70 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                              title="View Graph"
                            >
                              📊
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                )}
            </tbody>
          </table>
        </div>

        {/* Footer info bar */}
        <div className="bg-[#121620] border-t border-white/10 px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground/70">
          <span>
            Showing {singleDayEvents.length} event{singleDayEvents.length === 1 ? "" : "s"} for {viewDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <span>Timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
        </div>
      </div>

      {/* ── Interactive Detail / Graph Modal ───────────────────────────────── */}
      {activeModalEvent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setActiveModalEvent(null)}
        >
          <div
            className="bg-[#121620] border border-white/15 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{CURRENCY_FLAGS[activeModalEvent.currency] || "🌐"}</span>
                  <span className="font-bold text-xs bg-white/10 text-cyan-400 px-2 py-0.5 rounded font-mono">
                    {activeModalEvent.currency}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                      IMPACT_CONFIG[activeModalEvent.impact].bg
                    } ${IMPACT_CONFIG[activeModalEvent.impact].text}`}
                  >
                    {activeModalEvent.impact} Impact
                  </span>
                </div>
                <h3 className="text-base font-bold text-foreground">{activeModalEvent.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{activeModalEvent.country} · {activeModalEvent.source}</p>
              </div>

              <button
                type="button"
                onClick={() => setActiveModalEvent(null)}
                className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex items-center gap-4 border-b border-white/10 pb-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setModalTab("detail")}
                className={`pb-1 transition-colors relative ${
                  modalTab === "detail" ? "text-cyan-400" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Overview & Details
                {modalTab === "detail" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setModalTab("graph")}
                className={`pb-1 transition-colors relative ${
                  modalTab === "graph" ? "text-cyan-400" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Historical Comparison
                {modalTab === "graph" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" />
                )}
              </button>
            </div>

            {/* Tab Content */}
            {modalTab === "detail" ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-3 gap-2 bg-black/40 p-3 rounded-xl border border-white/10 text-center font-mono">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Actual</p>
                    <p className="text-sm font-bold text-emerald-400">{activeModalEvent.actual || "--"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Forecast</p>
                    <p className="text-sm font-bold text-foreground">{activeModalEvent.forecast || "--"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase">Previous</p>
                    <p className="text-sm font-bold text-muted-foreground">{activeModalEvent.previous || "--"}</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-muted-foreground/80 leading-relaxed text-[11px]">
                  <p>
                    <strong>Market Relevance:</strong> This economic metric is monitored closely by forex traders and central banks. Higher than expected numbers typically boost the strength of {activeModalEvent.currency}.
                  </p>
                  <p>
                    <strong>Scheduled Time:</strong> {new Date(activeModalEvent.event_time).toLocaleString()}
                  </p>
                </div>
              </div>
            ) : (
              /* Graph Tab Visualizer */
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium">Comparison (Actual vs Forecast vs Previous)</p>
                <div className="space-y-2 bg-black/40 p-4 rounded-xl border border-white/10">
                  {/* Bar 1: Actual */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-mono">
                      <span>Actual</span>
                      <span className="text-emerald-400 font-bold">{activeModalEvent.actual || "Pending"}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: activeModalEvent.actual ? "85%" : "0%" }} />
                    </div>
                  </div>

                  {/* Bar 2: Forecast */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-mono">
                      <span>Forecast</span>
                      <span className="text-cyan-400 font-bold">{activeModalEvent.forecast || "N/A"}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: "70%" }} />
                    </div>
                  </div>

                  {/* Bar 3: Previous */}
                  <div>
                    <div className="flex justify-between text-[11px] mb-1 font-mono">
                      <span>Previous</span>
                      <span className="text-muted-foreground font-bold">{activeModalEvent.previous || "N/A"}</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-white/30 rounded-full" style={{ width: "65%" }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Footer */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModalEvent(null)}
                className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Forex Factory Style Date Range Picker Modal ───────────────────── */}
      {isDatePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setIsDatePickerOpen(false)}
        >
          <div
            className="bg-[#f8fafc] text-zinc-800 border-4 border-emerald-500/40 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden font-sans text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-zinc-200 bg-white flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">
                  Date Range
                </label>
                <input
                  type="text"
                  readOnly
                  value={pickerTempDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  className="border border-zinc-300 rounded px-3 py-1.5 text-xs text-zinc-900 bg-zinc-50 w-64 font-mono font-medium shadow-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsDatePickerOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 font-bold text-base px-2"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Calendar Months Container */}
            <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Month Calendar */}
              <div>
                <div className="flex items-center justify-between font-bold text-zinc-700 mb-2">
                  <div className="flex items-center gap-1 text-cyan-700 font-bold">
                    <button
                      type="button"
                      onClick={() => setPickerMonthOffset((prev) => prev - 12)}
                      className="px-1.5 py-0.5 hover:bg-zinc-200 rounded transition-colors text-sm"
                      title="Previous Year (<<)"
                    >
                      «
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerMonthOffset((prev) => prev - 1)}
                      className="px-1.5 py-0.5 hover:bg-zinc-200 rounded transition-colors text-sm"
                      title="Previous Month (<)"
                    >
                      ‹
                    </button>
                  </div>
                  <span className="text-zinc-800 font-bold text-xs">
                    {MONTH_NAMES[leftMonthDate.getMonth()]} {leftMonthDate.getFullYear()}
                  </span>
                  <span className="w-8" />
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 text-center font-semibold text-zinc-400 text-[11px] mb-1">
                  <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {leftMonthDays.map((d, i) => {
                    if (d === null) return <div key={`left-empty-${i}`} className="h-7" />;
                    const isSelected =
                      pickerTempDate.getFullYear() === leftMonthDate.getFullYear() &&
                      pickerTempDate.getMonth() === leftMonthDate.getMonth() &&
                      pickerTempDate.getDate() === d;
                    const isToday =
                      new Date().getFullYear() === leftMonthDate.getFullYear() &&
                      new Date().getMonth() === leftMonthDate.getMonth() &&
                      new Date().getDate() === d;

                    return (
                      <button
                        type="button"
                        key={`left-day-${d}`}
                        onClick={() =>
                          setPickerTempDate(
                            new Date(leftMonthDate.getFullYear(), leftMonthDate.getMonth(), d)
                          )
                        }
                        className={`h-7 w-7 mx-auto flex items-center justify-center rounded transition-all ${
                          isSelected
                            ? "bg-[#62ba75] text-white font-bold shadow"
                            : isToday
                            ? "border border-emerald-500 text-emerald-700 font-bold hover:bg-emerald-50"
                            : "hover:bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Month Calendar */}
              <div>
                <div className="flex items-center justify-between font-bold text-zinc-700 mb-2">
                  <span className="w-8" />
                  <span className="text-zinc-800 font-bold text-xs">
                    {MONTH_NAMES[rightMonthDate.getMonth()]} {rightMonthDate.getFullYear()}
                  </span>
                  <div className="flex items-center gap-1 text-cyan-700 font-bold">
                    <button
                      type="button"
                      onClick={() => setPickerMonthOffset((prev) => prev + 1)}
                      className="px-1.5 py-0.5 hover:bg-zinc-200 rounded transition-colors text-sm"
                      title="Next Month (>)"
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerMonthOffset((prev) => prev + 12)}
                      className="px-1.5 py-0.5 hover:bg-zinc-200 rounded transition-colors text-sm"
                      title="Next Year (>>)"
                    >
                      »
                    </button>
                  </div>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 text-center font-semibold text-zinc-400 text-[11px] mb-1">
                  <span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span>
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {rightMonthDays.map((d, i) => {
                    if (d === null) return <div key={`right-empty-${i}`} className="h-7" />;
                    const isSelected =
                      pickerTempDate.getFullYear() === rightMonthDate.getFullYear() &&
                      pickerTempDate.getMonth() === rightMonthDate.getMonth() &&
                      pickerTempDate.getDate() === d;
                    const isToday =
                      new Date().getFullYear() === rightMonthDate.getFullYear() &&
                      new Date().getMonth() === rightMonthDate.getMonth() &&
                      new Date().getDate() === d;

                    return (
                      <button
                        type="button"
                        key={`right-day-${d}`}
                        onClick={() =>
                          setPickerTempDate(
                            new Date(rightMonthDate.getFullYear(), rightMonthDate.getMonth(), d)
                          )
                        }
                        className={`h-7 w-7 mx-auto flex items-center justify-center rounded transition-all ${
                          isSelected
                            ? "bg-[#62ba75] text-white font-bold shadow"
                            : isToday
                            ? "border border-emerald-500 text-emerald-700 font-bold hover:bg-emerald-50"
                            : "hover:bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Quick Presets Section */}
            <div className="px-4 py-2 bg-zinc-50 border-t border-b border-zinc-200 flex flex-wrap gap-4 text-xs font-semibold text-cyan-700">
              <button
                type="button"
                onClick={() => handleQuickPreset("this_week")}
                className="hover:underline hover:text-cyan-900 transition-colors"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset("next_week")}
                className="hover:underline hover:text-cyan-900 transition-colors"
              >
                Next Week
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset("this_month")}
                className="hover:underline hover:text-cyan-900 transition-colors"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset("next_month")}
                className="hover:underline hover:text-cyan-900 transition-colors"
              >
                Next Month
              </button>
            </div>

            {/* Bottom Action Footer */}
            <div className="p-3 bg-zinc-200/80 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setViewDate(pickerTempDate);
                  setIsDatePickerOpen(false);
                }}
                className="px-4 py-1.5 bg-white border border-zinc-400 hover:bg-zinc-100 text-zinc-800 font-semibold text-xs rounded shadow-sm transition-all"
              >
                Apply Settings
              </button>
              <button
                type="button"
                onClick={() => setIsDatePickerOpen(false)}
                className="px-4 py-1.5 bg-white border border-zinc-400 hover:bg-zinc-100 text-zinc-800 font-semibold text-xs rounded shadow-sm transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
