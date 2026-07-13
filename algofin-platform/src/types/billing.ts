// src/types/billing.ts
// AlgoFin v1 — Billing types (locked per plan.md Section 10)
// Field names must match schema and API contract exactly — do not alias.

export type PeriodStatus =
  | "open"
  | "estimated"
  | "acknowledged"
  | "paid"
  | "waived"
  | "incomplete";

export interface ProfitPeriod {
  id:                     string;
  period_start:           string;   // ISO date "2026-07-01"
  period_end:             string;   // ISO date "2026-07-31"
  total_realized_pnl:     number;   // matches schema column name exactly
  performance_fee_rate:   number;   // 0.20
  performance_fee_amount: number;   // max(0, total_realized_pnl) * rate
  status:                 PeriodStatus;
  notes:                  string | null;
}

// NOTE — locked field name rules:
//   total_realized_pnl      (NOT net_realized_pnl)
//   performance_fee_rate    (NOT estimated_fee_rate)
//   performance_fee_amount  (NOT estimated_fee_amount)
//   NO high_water_mark field — does not exist in schema
//   NO accounts_included array — query exchange_billing_consents separately

export interface BillingConsentPayload {
  consented:       boolean;
  consent_version: string;  // "v1.0"
  consent_text:    string;  // exact consent text shown to user
}

export interface BillingPeriodRecord {
  id:                   string;
  profit_period_id:     string;
  exchange_account_id:  string;
  user_id:              string;
  period_start:         string;
  period_end:           string;
  account_realized_pnl: number;
  data_complete:        boolean;
  notes:                string | null;
  created_at:           string;
  updated_at:           string;
}

// API response shape for /billing/periods/current
export interface BillingCurrentResponse {
  success: boolean;
  data:    ProfitPeriod;
}
