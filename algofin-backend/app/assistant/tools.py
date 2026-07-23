# app/assistant/tools.py
# AlgoFin v1 — AI Assistant tool definitions for Gemini function calling
#
# Each tool calls authoritative backend functions — NEVER duplicates logic.
# All PnL tools call calculate_period_pnl() as the single source of truth.
# plan.md Section 6 — tool layer spec.

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ── Tool: get_monthly_pnl ─────────────────────────────────────────


async def tool_get_monthly_pnl(
    db: AsyncSession,
    *,
    user_id: str,
    month: str | None = None,  # "YYYY-MM" format, defaults to current month
) -> dict:
    """
    Returns realized PnL for a specific calendar month.
    Calls calculate_period_pnl() — the single authoritative function.
    """
    from app.portfolio.pnl import calculate_period_pnl

    try:
        if month:
            year, m = int(month[:4]), int(month[5:7])
        else:
            today = date.today()
            year, m = today.year, today.month

        import calendar

        period_start = date(year, m, 1)
        last_day = calendar.monthrange(year, m)[1]
        period_end = date(year, m, last_day)

        result = await calculate_period_pnl(
            db,
            user_id=user_id,
            period_start=period_start,
            period_end=period_end,
        )

        return {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "total_realized_pnl": float(result.total_realized_pnl),
            "performance_fee_rate": float(result.performance_fee_rate),
            "performance_fee_amount": float(result.performance_fee_amount),
            "consented_accounts": len(result.consented_account_ids),
            "is_complete": result.is_complete,
            "incomplete_reason": result.incomplete_reason,
        }
    except Exception as exc:
        logger.error(f"tool_get_monthly_pnl error: {exc}")
        return {"error": str(exc)}


# ── Tool: get_estimated_fee ───────────────────────────────────────


async def tool_get_estimated_fee(db: AsyncSession, *, user_id: str) -> dict:
    """
    Returns current month estimated fee.
    Calls calculate_period_pnl() — same function as billing page.
    UI wording: 'Estimated monthly fee' — never 'performance fee' / 'invoice'.
    """
    result = await tool_get_monthly_pnl(db, user_id=user_id, month=None)
    if "error" in result:
        return result

    pnl = result["total_realized_pnl"]
    fee = result["performance_fee_amount"]

    return {
        **result,
        "summary": (
            f"Your estimated monthly fee for {result['period_start'][:7]} is "
            f"${fee:,.2f} USDT (20% of ${pnl:,.2f} realized profit). "
            "This is a display estimate only — no payment is collected during beta."
        )
        if pnl > 0
        else (
            f"No estimated fee for {result['period_start'][:7]} — "
            f"realized PnL is ${pnl:,.2f} USDT (fees only apply to profitable months)."
        ),
    }


# ── Tool: get_open_positions ──────────────────────────────────────


async def tool_get_open_positions(db: AsyncSession, *, user_id: str) -> dict:
    """Returns all currently open USDT-M Futures positions."""
    from sqlalchemy import select
    from app.models.exchange import UserExchangeAccount
    from app.models.trading import Position

    account_ids_result = await db.execute(
        select(UserExchangeAccount.id).where(
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    account_ids = [str(r) for r in account_ids_result.scalars().all()]

    if not account_ids:
        return {"positions": [], "count": 0, "note": "No exchange accounts connected."}

    pos_result = await db.execute(
        select(Position)
        .where(Position.exchange_account_id.in_(account_ids))
        .order_by(Position.unrealized_pnl.desc())
    )
    positions = pos_result.scalars().all()

    total_unrealized = sum(float(p.unrealized_pnl) for p in positions)

    return {
        "positions": [
            {
                "symbol": p.symbol,
                "side": p.side,
                "size": float(p.size),
                "entry_price": float(p.entry_price),
                "mark_price": float(p.mark_price),
                "unrealized_pnl": float(p.unrealized_pnl),
                "leverage": float(p.leverage),
                "margin_type": p.margin_type,
            }
            for p in positions
        ],
        "count": len(positions),
        "total_unrealized": total_unrealized,
        "note": "unrealized_pnl is for display only and not included in billing",
    }


# ── Tool: get_recent_trades ───────────────────────────────────────


async def tool_get_recent_trades(
    db: AsyncSession,
    *,
    user_id: str,
    limit: int = 20,
    symbol: str | None = None,
) -> dict:
    """Returns recent closed trades with realized PnL."""
    from sqlalchemy import select, and_
    from app.models.exchange import UserExchangeAccount
    from app.models.trading import Trade

    account_ids_result = await db.execute(
        select(UserExchangeAccount.id).where(
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    account_ids = [str(r) for r in account_ids_result.scalars().all()]
    if not account_ids:
        return {"trades": [], "count": 0}

    filters = [Trade.exchange_account_id.in_(account_ids)]
    if symbol:
        filters.append(Trade.symbol == symbol.upper())

    trade_result = await db.execute(
        select(Trade)
        .where(and_(*filters))
        .order_by(Trade.trade_time.desc())
        .limit(min(limit, 50))
    )
    trades = trade_result.scalars().all()

    total_pnl = sum(float(t.realized_pnl) for t in trades)

    return {
        "trades": [
            {
                "symbol": t.symbol,
                "side": t.side,
                "price": float(t.price),
                "qty": float(t.qty),
                "realized_pnl": float(t.realized_pnl),
                "commission": float(t.commission),
                "trade_time": t.trade_time.isoformat(),
            }
            for t in trades
        ],
        "count": len(trades),
        "total_pnl": total_pnl,
    }


# ── Tool: get_economic_events ─────────────────────────────────────


async def tool_get_economic_events(
    db: AsyncSession,
    *,
    days_ahead: int = 3,
    impact: str | None = None,
) -> dict:
    """Returns upcoming high-impact economic events from the calendar."""
    from sqlalchemy import select, and_
    from app.models.events import EconomicEvent

    now = datetime.now(timezone.utc)
    end = now + timedelta(days=min(days_ahead, 14))

    filters = [EconomicEvent.event_time >= now, EconomicEvent.event_time <= end]
    if impact:
        filters.append(EconomicEvent.impact == impact.lower())

    result = await db.execute(
        select(EconomicEvent)
        .where(and_(*filters))
        .order_by(EconomicEvent.event_time)
        .limit(20)
    )
    events = result.scalars().all()

    return {
        "events": [
            {
                "title": e.title,
                "currency": e.currency,
                "impact": e.impact,
                "event_time": e.event_time.isoformat(),
                "forecast": e.forecast,
                "previous": e.previous,
                "actual": e.actual,
            }
            for e in events
        ],
        "count": len(events),
        "days_ahead": days_ahead,
    }


# ── Tool: get_portfolio_summary ───────────────────────────────────


async def tool_get_portfolio_summary(db: AsyncSession, *, user_id: str) -> dict:
    """Returns a quick portfolio overview: balance, MTD PnL, open positions count."""
    from sqlalchemy import select, func
    from app.models.exchange import UserExchangeAccount
    from app.models.trading import Balance, Position
    from app.portfolio.pnl import calculate_period_pnl

    account_ids_result = await db.execute(
        select(UserExchangeAccount.id).where(
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    account_ids = [str(r) for r in account_ids_result.scalars().all()]

    if not account_ids:
        return {"note": "No exchange accounts connected."}

    bal = (
        await db.execute(
            select(func.sum(Balance.wallet_balance)).where(
                Balance.exchange_account_id.in_(account_ids)
            )
        )
    ).scalar_one_or_none() or 0

    pos_count = (
        await db.execute(
            select(func.count(Position.id)).where(
                Position.exchange_account_id.in_(account_ids)
            )
        )
    ).scalar_one_or_none() or 0

    today = date.today()
    pnl = await calculate_period_pnl(
        db,
        user_id=user_id,
        period_start=date(today.year, today.month, 1),
        period_end=today,
    )

    return {
        "wallet_balance_usdt": float(bal),
        "open_positions": pos_count,
        "realized_pnl_mtd": float(pnl.total_realized_pnl),
        "estimated_monthly_fee": float(pnl.performance_fee_amount),
        "connected_accounts": len(account_ids),
    }


# ── Gemini function declarations ──────────────────────────────────
# These are passed to Gemini as tool definitions for function calling.

GEMINI_TOOL_DECLARATIONS = [
    {
        "name": "get_monthly_pnl",
        "description": (
            "Get the total realized PnL and estimated monthly fee for a specific month. "
            "Returns realized profit/loss from all consented Binance Futures accounts."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "month": {
                    "type": "string",
                    "description": "Month in YYYY-MM format. Omit for current month.",
                }
            },
            "required": [],
        },
    },
    {
        "name": "get_estimated_fee",
        "description": (
            "Get the estimated monthly fee for the current billing period. "
            "Fee is 20% of realized profit (display estimate only — not a charge during beta)."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_open_positions",
        "description": "Get all currently open USDT-M Futures positions with unrealized PnL.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_recent_trades",
        "description": "Get recent closed trades with realized PnL.",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of trades to return (max 50, default 20)",
                },
                "symbol": {
                    "type": "string",
                    "description": "Filter by trading pair, e.g. 'BTCUSDT'",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_economic_events",
        "description": "Get upcoming high-impact economic calendar events.",
        "parameters": {
            "type": "object",
            "properties": {
                "days_ahead": {
                    "type": "integer",
                    "description": "How many days ahead to look (default 3, max 14)",
                },
                "impact": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": "Filter by impact level",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_portfolio_summary",
        "description": "Get a quick portfolio overview: total balance, open positions, MTD PnL, estimated fee.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
]


# ── Tool dispatcher ───────────────────────────────────────────────


async def dispatch_tool(
    name: str,
    args: dict,
    db: AsyncSession,
    user_id: str,
) -> dict:
    """Route a Gemini function call to the correct backend tool."""
    dispatch = {
        "get_monthly_pnl": lambda: tool_get_monthly_pnl(db, user_id=user_id, **args),
        "get_estimated_fee": lambda: tool_get_estimated_fee(db, user_id=user_id),
        "get_open_positions": lambda: tool_get_open_positions(db, user_id=user_id),
        "get_recent_trades": lambda: tool_get_recent_trades(
            db, user_id=user_id, **args
        ),
        "get_economic_events": lambda: tool_get_economic_events(db, **args),
        "get_portfolio_summary": lambda: tool_get_portfolio_summary(
            db, user_id=user_id
        ),
    }
    fn = dispatch.get(name)
    if fn is None:
        return {"error": f"Unknown tool: {name}"}
    return await fn()
