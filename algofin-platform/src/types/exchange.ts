// src/types/exchange.ts
// AlgoFin v1 — Exchange account types (Binance USDT-M Futures only)

export type SyncStatus = "pending" | "connected" | "syncing" | "error" | "stale";

export interface ExchangeAccount {
  id:               string;
  label:            string;
  exchange_id:      string;   // "binance_usdtm" only in v1
  sync_status:      SyncStatus;
  billing_consent:  boolean;
  last_sync_at:     string | null;
  billing_consent_at?: string | null;
  created_at:       string;
}

// POST /exchanges/connect request body (per plan.md Section 9)
export interface ConnectExchangePayload {
  exchange_id:      string;    // "binance_usdtm"
  label:            string;
  api_key:          string;
  api_secret:       string;
  passphrase:       string | null;
  billing_consent: {
    consented:        boolean;
    consent_version:  string;   // "v1.0"
    consent_text:     string;   // exact consent text displayed to user
  };
}

export interface ExchangeSyncRun {
  id:                  string;
  exchange_account_id: string;
  sync_type:           "balances" | "positions" | "trades" | "full";
  status:              "running" | "success" | "error" | "partial";
  started_at:          string;
  finished_at:         string | null;
  rows_processed:      number;
  error_message:       string | null;
  error_code:          string | null;
  triggered_by:        "scheduler" | "manual" | "webhook";
}
