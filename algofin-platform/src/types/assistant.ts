// src/types/assistant.ts
// AlgoFin v1 — AI Assistant types
// Scope: read-only, portfolio + events data only, no trade execution

// V1 assistant tool names — exactly 6, no more (per plan.md Section 6)
export type AssistantToolName =
  | "get_portfolio_summary"
  | "get_open_positions"
  | "get_recent_trades"
  | "get_monthly_pnl"
  | "get_estimated_fee"
  | "get_upcoming_events";

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id:          string;
  thread_id:   string;
  role:        MessageRole;
  content:     string;
  tool_calls?: AssistantToolCall[];
  created_at:  string;
}

export interface AssistantToolCall {
  tool_name: AssistantToolName;
  input:     Record<string, unknown>;
  output:    Record<string, unknown>;
  latency_ms: number;
  timestamp:  string;
}

export interface ChatThread {
  id:          string;
  user_id:     string;
  created_at:  string;
  updated_at:  string;
}

export interface SendMessagePayload {
  content: string;
}

export interface SendMessageResponse {
  success:    boolean;
  data: {
    message:  ChatMessage;
    thread_id: string;
  };
}
