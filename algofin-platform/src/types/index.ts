// src/types/index.ts
// AlgoFin v1 — Barrel export for all types

export type {
  User,
  UserRole,
  AuthTokens,
  LoginPayload,
  SignupPayload,
  AuthResponse,
} from "./auth";

export type {
  PeriodStatus,
  ProfitPeriod,
  BillingConsentPayload,
  BillingPeriodRecord,
  BillingCurrentResponse,
} from "./billing";

export type {
  SyncStatus,
  ExchangeAccount,
  ConnectExchangePayload,
  ExchangeSyncRun,
} from "./exchange";

export type {
  DataFreshnessItem,
  PortfolioSummary,
  Position,
  Trade,
  Balance,
} from "./dashboard";

export { STALENESS_THRESHOLDS_MS } from "./dashboard";

export type {
  ImpactLevel,
  EconomicEvent,
  EventsQueryParams,
} from "./events";

export type {
  AssistantToolName,
  MessageRole,
  ChatMessage,
  AssistantToolCall,
  ChatThread,
  SendMessagePayload,
  SendMessageResponse,
} from "./assistant";
