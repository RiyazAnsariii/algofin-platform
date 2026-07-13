// src/lib/staleness.ts
// AlgoFin v1 — Data staleness utility
// Staleness thresholds per plan.md Section 8:
//   Balances:  stale if last_sync_at > 15 minutes ago
//   Positions: stale if last_sync_at > 10 minutes ago
//   Trades:    stale if last_sync_at > 30 minutes ago
//   Events:    stale if last_fetched_at > 60 minutes ago

import { STALENESS_THRESHOLDS_MS } from "@/types/dashboard";

export type DataDomain = keyof typeof STALENESS_THRESHOLDS_MS;

/**
 * Returns true if the given synced_at timestamp is older than the
 * staleness threshold for the specified data domain.
 */
export function isStale(
  synced_at: string | null | undefined,
  domain: DataDomain
): boolean {
  if (!synced_at) return true;

  const syncedMs  = new Date(synced_at).getTime();
  const nowMs     = Date.now();
  const threshold = STALENESS_THRESHOLDS_MS[domain];

  return nowMs - syncedMs > threshold;
}

/**
 * Returns a human-readable relative time string.
 * e.g. "3 min ago", "just now", "1 hr ago"
 */
export function relativeTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "never";

  const diffMs   = Date.now() - new Date(timestamp).getTime();
  const diffSec  = Math.floor(diffMs / 1000);
  const diffMin  = Math.floor(diffSec / 60);
  const diffHr   = Math.floor(diffMin / 60);

  if (diffSec < 10) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24)  return `${diffHr} hr ago`;

  return new Date(timestamp).toLocaleDateString();
}

/**
 * Returns a staleness label + severity for UI display
 */
export function stalenessLabel(
  synced_at: string | null,
  domain: DataDomain
): { label: string; stale: boolean } {
  const stale = isStale(synced_at, domain);
  const label = synced_at ? `Synced ${relativeTime(synced_at)}` : "Never synced";
  return { label, stale };
}
