// src/types/events.ts
// AlgoFin v1 — Economic calendar event types
// NOTE: This is an economic CALENDAR — NOT a news feed.
// Label in UI: "Economic Calendar" / "Upcoming High-Impact Events" / "Market Events"
// NEVER: "News Feed", "Live Market Intelligence", "AI-Powered News Feed"

export type ImpactLevel = "low" | "medium" | "high";

export interface EconomicEvent {
  id:          string;
  title:       string;
  currency:    string;    // e.g. "USD", "EUR", "CNY"
  country:     string;    // e.g. "United States"
  impact:      ImpactLevel;
  event_time:  string;    // ISO datetime
  forecast:    string | null;
  previous:    string | null;
  actual:      string | null;  // null if event has not occurred yet
  source:      string;
  fetched_at:  string;
  is_stale:    boolean;
}

export interface EventsQueryParams {
  impact_level?: ImpactLevel;
  currency?:     string;
  days_ahead?:   number;    // default 7
  from_date?:    string;
  to_date?:      string;
}
