// src/types/events.ts
// AlgoFin v1 — Economic calendar event types

export type ImpactLevel = "low" | "medium" | "high" | "Low" | "Medium" | "High";
export type EventStatus = "Completed" | "Upcoming" | "Ongoing";

export interface EconomicEvent {
  id: string;
  title: string;
  currency: string; // e.g. "USD", "EUR", "CNY"
  country: string; // e.g. "United States"
  impact: ImpactLevel;
  event_time: string; // ISO datetime UTC
  forecast: string | null;
  previous: string | null;
  actual: string | null; // null if event has not occurred yet
  source: string;
  status: EventStatus;
  last_updated_at: string;
}

export interface EconomicSummary {
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface EconomicMetadata {
  provider: string;
  cached: boolean;
  cache_age_seconds: number;
  data_age_minutes: number;
  total_results: number;
}

export interface EconomicCalendarApiResponse {
  events: EconomicEvent[];
  summary: EconomicSummary;
  metadata: EconomicMetadata;
}

export interface EventsQueryParams {
  days?: number; // 1, 7, 14, 30
  impact?: string; // High, Medium, Low, All
  currency?: string; // USD, EUR, etc., or All
  search?: string; // search title/country
}
