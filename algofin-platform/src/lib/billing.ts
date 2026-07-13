// src/lib/billing.ts
// AlgoFin v1 — Billing display utilities
// UI wording rules per plan.md Section 5-A:
//   CORRECT: "Estimated monthly fee", "AlgoFin billing estimate",
//            "Current billing summary", "Projected fee for this period"
//   NEVER:   "Performance fee", "Invoice", "Amount due"

import type { ProfitPeriod, PeriodStatus } from "@/types";

/**
 * Computes the estimated fee amount from a profit period.
 * This is a DISPLAY function only — not the authoritative calculation.
 * The authoritative calculation is calculate_period_pnl() on the backend.
 */
export function computeEstimatedFee(
  total_realized_pnl: number,
  performance_fee_rate: number
): number {
  if (total_realized_pnl <= 0) return 0;
  return total_realized_pnl * performance_fee_rate;
}

/**
 * Format a USDT amount with proper sign and 2 decimal places.
 */
export function formatUsdt(amount: number, opts?: { showSign?: boolean }): string {
  const formatted = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts?.showSign) {
    const sign = amount > 0 ? "+" : amount < 0 ? "-" : "";
    return `${sign}$${formatted}`;
  }
  return `$${amount < 0 ? "-" : ""}${formatted}`;
}

/**
 * Returns the correct UI label for a period status.
 * Never use "Invoice" or "Amount due" in v1.
 */
export function periodStatusLabel(status: PeriodStatus): string {
  const labels: Record<PeriodStatus, string> = {
    open:         "In Progress",
    estimated:    "Estimated",
    acknowledged: "Acknowledged",
    paid:         "Settled",
    waived:       "Waived",
    incomplete:   "Incomplete — Data Missing",
  };
  return labels[status] ?? "Unknown";
}

/**
 * Returns the UI-safe billing summary wording.
 * Always shows "Estimated monthly fee" — never "Invoice" or "Performance fee".
 */
export function billingPeriodDisplay(period: ProfitPeriod): {
  title:           string;
  pnlLabel:        string;
  feeLabel:        string;
  statusLabel:     string;
  feeAmount:       number;
  pnlPositive:     boolean;
  showFee:         boolean;
} {
  const feeAmount   = computeEstimatedFee(
    period.total_realized_pnl,
    period.performance_fee_rate
  );
  const pnlPositive = period.total_realized_pnl > 0;
  const showFee     = pnlPositive && period.status !== "incomplete";

  return {
    title:       "Estimated monthly fee",
    pnlLabel:    "Realized PnL (month-to-date)",
    feeLabel:    "AlgoFin billing estimate",
    statusLabel: periodStatusLabel(period.status),
    feeAmount,
    pnlPositive,
    showFee,
  };
}

/**
 * Returns date range label for a billing period.
 * e.g. "July 2026"
 */
export function periodMonthLabel(period_start: string): string {
  return new Date(period_start).toLocaleDateString("en-US", {
    month: "long",
    year:  "numeric",
  });
}
