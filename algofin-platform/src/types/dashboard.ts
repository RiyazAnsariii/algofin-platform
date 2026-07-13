// src/types/dashboard.ts
// AlgoFin v1 — Dashboard and portfolio types

// Per plan.md Section 8 & 9 — data_freshness is required in every portfolio response
export interface DataFreshnessItem {
  synced_at: string | null;
  is_stale:  boolean;
}

export interface PortfolioSummary {
  total_value_usdt:   number;
  open_positions:     number;
  realized_pnl_mtd:  number;
  connected_accounts: number;
  data_freshness: {
    balances:  DataFreshnessItem;
    positions: DataFreshnessItem;
    trades:    DataFreshnessItem;
  };
}

export interface Position {
  id:                string;
  exchange_account_id: string;
  symbol:            string;
  side:              "long" | "short";
  size:              number;
  entry_price:       number;
  mark_price:        number;
  unrealized_pnl:    number;  // display only — excluded from billing
  leverage:          number;
  margin_type:       "isolated" | "cross";
  last_updated_at:   string;
}

export interface Trade {
  id:                string;
  exchange_account_id: string;
  order_id:          string;
  symbol:            string;
  side:              "buy" | "sell";
  price:             number;
  qty:               number;
  realized_pnl:      number;  // realizedPnl field from Binance API
  commission:        number;
  commission_asset:  string;
  trade_time:        string;
}

export interface Balance {
  id:                 string;
  exchange_account_id: string;
  asset:              string;
  wallet_balance:     number;
  unrealized_pnl:     number;
  margin_balance:     number;
  available_balance:  number;
  synced_at:          string;
}

// Staleness thresholds per plan.md Section 8
export const STALENESS_THRESHOLDS_MS = {
  balances:  15 * 60 * 1000,  // 15 minutes
  positions: 10 * 60 * 1000,  // 10 minutes
  trades:    30 * 60 * 1000,  // 30 minutes
  events:    60 * 60 * 1000,  // 60 minutes
} as const;
