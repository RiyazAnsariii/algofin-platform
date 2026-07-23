# app/portfolio/router.py
# AlgoFin v1 — Portfolio endpoints
# GET /portfolio/summary — with data_freshness (plan.md Section 9)
# GET /positions        — open positions
# GET /trades           — recent trades

from datetime import date, datetime

from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.common.staleness import compute_data_freshness
from app.models.exchange import UserExchangeAccount
from app.models.trading import Balance, Position, Trade
from app.portfolio.pnl import calculate_period_pnl

router = APIRouter(tags=["portfolio"])


@router.get("/portfolio/summary", response_model=SuccessResponse[dict])
async def portfolio_summary(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    """
    Portfolio summary with data_freshness block.
    plan.md Section 9 — GET /portfolio/summary response contract.
    """
    user_id = str(current_user.id)

    # Get connected accounts
    accts_result = await db.execute(
        select(UserExchangeAccount).where(
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    accounts = list(accts_result.scalars().all())
    account_ids = [str(a.id) for a in accounts]

    if not account_ids:
        return SuccessResponse(
            data={
                "total_value_usdt": 0.0,
                "open_positions": 0,
                "realized_pnl_mtd": 0.0,
                "connected_accounts": 0,
                "data_freshness": {
                    "balances": {"synced_at": None, "is_stale": True},
                    "positions": {"synced_at": None, "is_stale": True},
                    "trades": {"synced_at": None, "is_stale": True},
                },
            }
        )

    # Total USDT wallet balance
    bal_result = await db.execute(
        select(func.sum(Balance.wallet_balance)).where(
            Balance.exchange_account_id.in_(account_ids)
        )
    )
    total_value = float(bal_result.scalar_one_or_none() or 0)

    # Open position count
    pos_result = await db.execute(
        select(func.count(Position.id)).where(
            Position.exchange_account_id.in_(account_ids)
        )
    )
    open_positions = pos_result.scalar_one_or_none() or 0

    # Realized PnL month-to-date (using authoritative calculate_period_pnl)
    today = date.today()
    period_start = date(today.year, today.month, 1)
    pnl_result = await calculate_period_pnl(
        db,
        user_id=user_id,
        period_start=period_start,
        period_end=today,
    )

    # Freshness timestamps — find latest sync per data type
    # Balances freshness
    bal_sync_result = await db.execute(
        select(func.max(Balance.synced_at)).where(
            Balance.exchange_account_id.in_(account_ids)
        )
    )
    balances_synced_at: datetime | None = bal_sync_result.scalar_one_or_none()

    # Positions freshness
    pos_sync_result = await db.execute(
        select(func.max(Position.synced_at)).where(
            Position.exchange_account_id.in_(account_ids)
        )
    )
    positions_synced_at: datetime | None = pos_sync_result.scalar_one_or_none()

    # Trades freshness
    trade_sync_result = await db.execute(
        select(func.max(Trade.synced_at)).where(
            Trade.exchange_account_id.in_(account_ids)
        )
    )
    trades_synced_at: datetime | None = trade_sync_result.scalar_one_or_none()

    data_freshness = compute_data_freshness(
        balances_synced_at, positions_synced_at, trades_synced_at
    )

    return SuccessResponse(
        data={
            "total_value_usdt": round(total_value, 2),
            "open_positions": open_positions,
            "realized_pnl_mtd": float(pnl_result.total_realized_pnl),
            "connected_accounts": len(accounts),
            "data_freshness": data_freshness,
        }
    )


@router.get("/positions", response_model=SuccessResponse[list[dict]])
async def list_positions(
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[list[dict]]:
    """List all open positions for the current user."""
    accts_result = await db.execute(
        select(UserExchangeAccount.id).where(
            UserExchangeAccount.user_id == current_user.id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    account_ids = [str(r) for r in accts_result.scalars().all()]

    if not account_ids:
        return SuccessResponse(data=[])

    pos_result = await db.execute(
        select(Position)
        .where(Position.exchange_account_id.in_(account_ids))
        .order_by(Position.synced_at.desc())
    )
    positions = pos_result.scalars().all()

    return SuccessResponse(
        data=[
            {
                "id": str(p.id),
                "exchange_account_id": str(p.exchange_account_id),
                "symbol": p.symbol,
                "side": p.side,
                "size": float(p.size),
                "entry_price": float(p.entry_price),
                "mark_price": float(p.mark_price),
                "unrealized_pnl": float(p.unrealized_pnl),
                # unrealized_pnl: display only — excluded from billing
                "leverage": float(p.leverage),
                "margin_type": p.margin_type,
                "last_updated_at": p.last_updated_at.isoformat(),
            }
            for p in positions
        ]
    )


@router.get("/trades", response_model=SuccessResponse[list[dict]])
async def list_trades(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(default=50, le=200),
) -> SuccessResponse[list[dict]]:
    """List recent trades for the current user."""
    accts_result = await db.execute(
        select(UserExchangeAccount.id).where(
            UserExchangeAccount.user_id == current_user.id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    account_ids = [str(r) for r in accts_result.scalars().all()]

    if not account_ids:
        return SuccessResponse(data=[])

    trade_result = await db.execute(
        select(Trade)
        .where(Trade.exchange_account_id.in_(account_ids))
        .order_by(Trade.trade_time.desc())
        .limit(limit)
    )
    trades = trade_result.scalars().all()

    return SuccessResponse(
        data=[
            {
                "id": str(t.id),
                "exchange_account_id": str(t.exchange_account_id),
                "order_id": t.order_id,
                "symbol": t.symbol,
                "side": t.side,
                "price": float(t.price),
                "qty": float(t.qty),
                "realized_pnl": float(t.realized_pnl),
                "commission": float(t.commission),
                "commission_asset": t.commission_asset,
                "trade_time": t.trade_time.isoformat(),
            }
            for t in trades
        ]
    )
