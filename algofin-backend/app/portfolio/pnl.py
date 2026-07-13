# app/portfolio/pnl.py
# AlgoFin v1 — THE SINGLE AUTHORITATIVE PnL CALCULATION FUNCTION
#
# This is the ONLY place where realized PnL is calculated.
# Dashboard, billing page, and AI assistant ALL call this function.
# NEVER duplicate this logic. plan.md Risk 3 & Section 5-A.
#
#   calculate_period_pnl(user_id, period_start, period_end)
#     → total_realized_pnl
#     → performance_fee_rate
#     → performance_fee_amount
#     → consented_account_ids
#     → is_complete
#
# Billing PnL inclusion rules (plan.md Section 5-A, locked):
#   INCLUDE: realized PnL from closing futures positions
#   EXCLUDE: unrealized PnL, funding payments, deposits/withdrawals,
#            referral rebates, manual adjustments
#   SOURCE:  Binance API realizedPnl field (via trades table)
#            Do NOT subtract commissions — Binance already nets them.

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exchange import ExchangeBillingConsent, ExchangeSyncRun, UserExchangeAccount
from app.models.trading import Trade

logger = logging.getLogger(__name__)


@dataclass
class PeriodPnLResult:
    """
    Result of calculate_period_pnl().
    Field names match schema and API contract exactly (plan.md Section 5-A).
    """
    # Locked field names — do not alias
    total_realized_pnl:     Decimal
    performance_fee_rate:   Decimal
    performance_fee_amount: Decimal

    # Metadata
    consented_account_ids: list[str]
    is_complete:           bool  # False if any sync run failed during the period
    incomplete_reason:     str | None


async def calculate_period_pnl(
    db: AsyncSession,
    *,
    user_id: str,
    period_start: date,
    period_end: date,
    performance_fee_rate: Decimal = Decimal("0.20"),
) -> PeriodPnLResult:
    """
    THE authoritative PnL calculation for a billing period.
    Called by:
      - /portfolio/summary endpoint
      - /billing/periods/current endpoint
      - AI assistant get_monthly_pnl() tool
      - AI assistant get_estimated_fee() tool
      - Billing period refresh task

    Rules (plan.md Section 5-A):
    1. Only trades from CONSENTED accounts are included.
    2. Only trades where realized_pnl != 0 (closing trades).
    3. Trade date must fall within [period_start, period_end].
    4. realized_pnl is taken from the trades.realized_pnl column directly
       (sourced from Binance API realizedPnl field — no re-derivation).
    5. is_complete = False if any exchange_sync_runs row for any consented
       account has status='error' during the period.
    """
    # ── Step 1: Find consented account IDs for this user ──────────
    result = await db.execute(
        select(UserExchangeAccount.id).where(
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.billing_consent == True,  # noqa: E712
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    consented_ids = [str(row) for row in result.scalars().all()]

    if not consented_ids:
        return PeriodPnLResult(
            total_realized_pnl=Decimal("0"),
            performance_fee_rate=performance_fee_rate,
            performance_fee_amount=Decimal("0"),
            consented_account_ids=[],
            is_complete=True,
            incomplete_reason=None,
        )

    # ── Step 2: Sum realized PnL from trades in the period ────────
    period_start_dt = datetime(period_start.year, period_start.month, period_start.day, tzinfo=timezone.utc)
    period_end_dt   = datetime(period_end.year,   period_end.month,   period_end.day,   23, 59, 59, tzinfo=timezone.utc)

    pnl_result = await db.execute(
        select(func.sum(Trade.realized_pnl)).where(
            and_(
                Trade.exchange_account_id.in_(consented_ids),
                Trade.trade_time >= period_start_dt,
                Trade.trade_time <= period_end_dt,
                Trade.realized_pnl != Decimal("0"),
                # Exclude zero-pnl rows (opening trades, funding etc.)
            )
        )
    )
    raw_sum = pnl_result.scalar_one_or_none()
    total_realized_pnl = Decimal(str(raw_sum or 0))

    # ── Step 3: Check data completeness ──────────────────────────
    # If any sync run for a consented account failed during the period,
    # data is incomplete → fee cannot be finalized.
    failed_runs_result = await db.execute(
        select(func.count(ExchangeSyncRun.id)).where(
            and_(
                ExchangeSyncRun.exchange_account_id.in_(consented_ids),
                ExchangeSyncRun.status.in_(["error", "partial"]),
                ExchangeSyncRun.started_at >= period_start_dt,
                ExchangeSyncRun.started_at <= period_end_dt,
            )
        )
    )
    failed_count = failed_runs_result.scalar_one_or_none() or 0
    is_complete = failed_count == 0
    incomplete_reason = (
        f"Fee calculation incomplete — {failed_count} sync run(s) failed during this period"
        if not is_complete else None
    )

    # ── Step 4: Compute fee ────────────────────────────────────────
    # No fee in loss months (total_realized_pnl <= 0)
    # No high-water mark — each month is independent
    # plan.md Section 5
    if total_realized_pnl > 0:
        performance_fee_amount = total_realized_pnl * performance_fee_rate
    else:
        performance_fee_amount = Decimal("0")

    return PeriodPnLResult(
        total_realized_pnl=total_realized_pnl,
        performance_fee_rate=performance_fee_rate,
        performance_fee_amount=performance_fee_amount,
        consented_account_ids=consented_ids,
        is_complete=is_complete,
        incomplete_reason=incomplete_reason,
    )
