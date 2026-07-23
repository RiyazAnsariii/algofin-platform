# app/billing/service.py
# AlgoFin v1 — Billing service (get/create/refresh billing periods)

import calendar
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import UserProfitPeriod
from app.portfolio.pnl import calculate_period_pnl


def _current_period_dates() -> tuple[date, date]:
    """Return (period_start, period_end) for the current calendar month."""
    today = date.today()
    start = date(today.year, today.month, 1)
    last_day = calendar.monthrange(today.year, today.month)[1]
    end = date(today.year, today.month, last_day)
    return start, end


async def get_or_create_current_period(
    db: AsyncSession,
    *,
    user_id: str,
) -> UserProfitPeriod:
    """
    Get the current billing period (or create it if missing).
    Refreshes PnL from the authoritative calculate_period_pnl() function.
    """
    period_start, period_end = _current_period_dates()

    result = await db.execute(
        select(UserProfitPeriod).where(
            UserProfitPeriod.user_id == user_id,
            UserProfitPeriod.period_start == period_start,
        )
    )
    period = result.scalar_one_or_none()

    # Calculate current PnL from authoritative function
    pnl = await calculate_period_pnl(
        db,
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
    )

    if period is None:
        period = UserProfitPeriod(
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
            total_realized_pnl=pnl.total_realized_pnl,
            performance_fee_rate=pnl.performance_fee_rate,
            performance_fee_amount=pnl.performance_fee_amount,
            status="open" if pnl.is_complete else "incomplete",
            notes=pnl.incomplete_reason,
        )
        db.add(period)
    else:
        # Refresh from latest data
        period.total_realized_pnl = pnl.total_realized_pnl
        period.performance_fee_rate = pnl.performance_fee_rate
        period.performance_fee_amount = pnl.performance_fee_amount
        if not pnl.is_complete:
            period.status = "incomplete"
            period.notes = pnl.incomplete_reason
        elif period.status in ("open", "incomplete"):
            period.status = "estimated" if pnl.total_realized_pnl > 0 else "open"

    await db.commit()
    await db.refresh(period)
    return period


async def list_period_history(
    db: AsyncSession,
    *,
    user_id: str,
) -> list[UserProfitPeriod]:
    """Return all billing periods for a user, ordered newest first."""
    result = await db.execute(
        select(UserProfitPeriod)
        .where(UserProfitPeriod.user_id == user_id)
        .order_by(UserProfitPeriod.period_start.desc())
    )
    return list(result.scalars().all())
