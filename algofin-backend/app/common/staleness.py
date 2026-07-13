# app/common/staleness.py
# AlgoFin v1 — Backend staleness computation
# Thresholds per plan.md Section 8.
# data_freshness must be included in every /portfolio/summary response.

from datetime import datetime, timezone
from typing import TypedDict

from app.config import settings


class FreshnessItem(TypedDict):
    synced_at: str | None
    is_stale: bool


def compute_freshness(synced_at: datetime | None, threshold_minutes: int) -> FreshnessItem:
    """
    Compute whether a given sync timestamp is stale.
    Returns a FreshnessItem dict matching the API response contract (plan.md Section 9).
    """
    if synced_at is None:
        return {"synced_at": None, "is_stale": True}

    now = datetime.now(timezone.utc)
    # Ensure synced_at is timezone-aware
    if synced_at.tzinfo is None:
        synced_at = synced_at.replace(tzinfo=timezone.utc)

    age_minutes = (now - synced_at).total_seconds() / 60
    is_stale = age_minutes > threshold_minutes

    return {
        "synced_at": synced_at.isoformat(),
        "is_stale": is_stale,
    }


def compute_data_freshness(
    balances_synced_at: datetime | None,
    positions_synced_at: datetime | None,
    trades_synced_at: datetime | None,
) -> dict[str, FreshnessItem]:
    """
    Build the full data_freshness block for /portfolio/summary response.
    plan.md Section 9 — response contract.
    """
    return {
        "balances": compute_freshness(balances_synced_at, settings.stale_balances_minutes),
        "positions": compute_freshness(positions_synced_at, settings.stale_positions_minutes),
        "trades": compute_freshness(trades_synced_at, settings.stale_trades_minutes),
    }
