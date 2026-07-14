# app/journal/router.py
# AlgoFin v2 — Phase G: Journal & Analytics REST API
#
# Journal CRUD:
#   GET    /journal/entries            — list (newest first, filterable by date range)
#   POST   /journal/entries            — create
#   GET    /journal/entries/{id}       — get single
#   PATCH  /journal/entries/{id}       — update
#   DELETE /journal/entries/{id}       — delete
#
# Analytics:
#   GET    /journal/analytics          — full summary (PnL stats + daily series + symbol breakdown)
#                                        ?days=30  (7 | 30 | 90 | 365)

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select, desc, func

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.journal.schemas import (
    AnalyticsSummary,
    DailyPnL,
    JournalEntryCreate,
    JournalEntryResponse,
    JournalEntryUpdate,
    SymbolBreakdown,
)
from app.models.journal import JournalEntry
from app.models.trading import Trade
from app.models.exchange import UserExchangeAccount

router = APIRouter(prefix="/journal", tags=["journal"])


# ── Journal CRUD ───────────────────────────────────────────────────────────

@router.get("/entries", response_model=SuccessResponse[list[JournalEntryResponse]])
async def list_entries(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = 50,
    offset: int = 0,
    from_date: str | None = None,
    to_date: str | None = None,
) -> SuccessResponse:
    q = select(JournalEntry).where(JournalEntry.user_id == str(current_user.id))
    if from_date:
        q = q.where(JournalEntry.entry_date >= from_date)
    if to_date:
        q = q.where(JournalEntry.entry_date <= to_date)
    q = q.order_by(desc(JournalEntry.entry_date)).limit(min(limit, 200)).offset(offset)
    result = await db.execute(q)
    entries = result.scalars().all()
    return SuccessResponse(data=[JournalEntryResponse.from_orm_obj(e) for e in entries])


@router.post("/entries", response_model=SuccessResponse[JournalEntryResponse], status_code=201)
async def create_entry(
    body: JournalEntryCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    entry = JournalEntry(
        user_id=str(current_user.id),
        entry_date=body.entry_date,
        title=body.title,
        body=body.body,
        symbol=body.symbol,
        tags=",".join(body.tags) if body.tags else None,
        mood=body.mood,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return SuccessResponse(data=JournalEntryResponse.from_orm_obj(entry))


@router.get("/entries/{entry_id}", response_model=SuccessResponse[JournalEntryResponse])
async def get_entry(
    entry_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == str(current_user.id),
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    return SuccessResponse(data=JournalEntryResponse.from_orm_obj(entry))


@router.patch("/entries/{entry_id}", response_model=SuccessResponse[JournalEntryResponse])
async def update_entry(
    entry_id: str,
    body: JournalEntryUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == str(current_user.id),
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")

    if body.title is not None:
        entry.title = body.title.strip()
    if body.body is not None:
        entry.body = body.body
    if body.symbol is not None:
        entry.symbol = body.symbol.upper().strip()
    if body.tags is not None:
        entry.tags = ",".join(body.tags)
    if body.mood is not None:
        entry.mood = body.mood

    await db.commit()
    await db.refresh(entry)
    return SuccessResponse(data=JournalEntryResponse.from_orm_obj(entry))


@router.delete("/entries/{entry_id}", response_model=SuccessResponse[dict])
async def delete_entry(
    entry_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(JournalEntry).where(
            JournalEntry.id == entry_id,
            JournalEntry.user_id == str(current_user.id),
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    await db.delete(entry)
    await db.commit()
    return SuccessResponse(data={"deleted": True})


# ── Analytics ──────────────────────────────────────────────────────────────

@router.get("/analytics", response_model=SuccessResponse[AnalyticsSummary])
async def get_analytics(
    current_user: CurrentUser,
    db: DbSession,
    days: int = Query(default=30, ge=1, le=365),
) -> SuccessResponse:
    """
    Compute performance analytics for the given rolling window.
    Pulls from the trades table (Binance fills) for all user exchange accounts.
    """
    tz = timezone.utc
    to_dt   = datetime.now(tz)
    from_dt = to_dt - timedelta(days=days)
    from_d  = from_dt.date()
    to_d    = to_dt.date()

    # Get all exchange account IDs for this user
    acct_result = await db.execute(
        select(UserExchangeAccount.id).where(
            UserExchangeAccount.user_id == str(current_user.id),
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    account_ids = [str(r) for r in acct_result.scalars().all()]

    if not account_ids:
        return SuccessResponse(data=_empty_summary(days, from_d, to_d))

    # Fetch all trades in the window
    trade_result = await db.execute(
        select(Trade).where(
            Trade.exchange_account_id.in_(account_ids),
            Trade.trade_time >= from_dt,
            Trade.trade_time <= to_dt,
        ).order_by(Trade.trade_time)
    )
    trades = trade_result.scalars().all()

    if not trades:
        return SuccessResponse(data=_empty_summary(days, from_d, to_d))

    return SuccessResponse(data=_compute_analytics(trades, days, from_d, to_d))


# ── Analytics computation ──────────────────────────────────────────────────

def _empty_summary(days: int, from_d: date, to_d: date) -> AnalyticsSummary:
    return AnalyticsSummary(
        period_days=days,
        from_date=from_d.isoformat(),
        to_date=to_d.isoformat(),
        total_trades=0,
        realized_pnl="0",
        total_commission="0",
        net_pnl="0",
        win_count=0,
        loss_count=0,
        win_rate=0.0,
        profit_factor=0.0,
        avg_win="0",
        avg_loss="0",
        avg_trade="0",
        max_single_win="0",
        max_single_loss="0",
        best_day_pnl="0",
        worst_day_pnl="0",
        daily_pnl=[],
        by_symbol=[],
    )


def _compute_analytics(trades, days: int, from_d: date, to_d: date) -> AnalyticsSummary:
    ZERO = Decimal("0")

    total_pnl   = ZERO
    total_comm  = ZERO
    gross_win   = ZERO
    gross_loss  = ZERO
    win_count   = 0
    loss_count  = 0
    max_win     = ZERO
    max_loss    = ZERO   # stored as negative value

    # Daily aggregates: date → {pnl, count}
    daily: dict[str, dict] = defaultdict(lambda: {"pnl": ZERO, "count": 0})

    # Symbol aggregates
    by_sym: dict[str, dict] = defaultdict(
        lambda: {"count": 0, "pnl": ZERO, "wins": 0, "losses": 0}
    )

    for t in trades:
        pnl  = Decimal(str(t.realized_pnl))
        comm = Decimal(str(t.commission))
        sym  = t.symbol
        d    = t.trade_time.date().isoformat()

        total_pnl  += pnl
        total_comm += comm

        if pnl > ZERO:
            win_count += 1
            gross_win += pnl
            if pnl > max_win:
                max_win = pnl
            by_sym[sym]["wins"] += 1
        elif pnl < ZERO:
            loss_count += 1
            gross_loss += pnl   # negative
            if pnl < max_loss:
                max_loss = pnl
            by_sym[sym]["losses"] += 1

        daily[d]["pnl"]   += pnl
        daily[d]["count"] += 1
        by_sym[sym]["count"] += 1
        by_sym[sym]["pnl"]   += pnl

    total_trades = len(trades)
    win_rate = win_count / total_trades if total_trades else 0.0
    profit_factor = (
        float(gross_win / abs(gross_loss))
        if gross_loss != ZERO else (float("inf") if gross_win > ZERO else 0.0)
    )
    profit_factor = min(profit_factor, 9999.0)   # cap for JSON safety

    avg_win   = gross_win / win_count   if win_count   else ZERO
    avg_loss  = gross_loss / loss_count if loss_count  else ZERO
    avg_trade = total_pnl / total_trades

    # Daily PnL series with cumulative
    sorted_days = sorted(daily.keys())
    cumulative  = ZERO
    daily_series: list[DailyPnL] = []
    best_day  = ZERO
    worst_day = ZERO
    for d in sorted_days:
        dp = daily[d]["pnl"]
        cumulative += dp
        if dp > best_day:
            best_day = dp
        if dp < worst_day:
            worst_day = dp
        daily_series.append(DailyPnL(
            date=d,
            pnl=str(round(dp, 4)),
            trade_count=daily[d]["count"],
            cumulative_pnl=str(round(cumulative, 4)),
        ))

    # Symbol breakdown (top 10)
    sym_list = sorted(by_sym.items(), key=lambda x: x[1]["count"], reverse=True)[:10]
    symbol_breakdown = [
        SymbolBreakdown(
            symbol=sym,
            trade_count=v["count"],
            realized_pnl=str(round(v["pnl"], 4)),
            win_count=v["wins"],
            loss_count=v["losses"],
            win_rate=v["wins"] / v["count"] if v["count"] else 0.0,
        )
        for sym, v in sym_list
    ]

    return AnalyticsSummary(
        period_days=days,
        from_date=from_d.isoformat(),
        to_date=to_d.isoformat(),
        total_trades=total_trades,
        realized_pnl=str(round(total_pnl, 4)),
        total_commission=str(round(total_comm, 4)),
        net_pnl=str(round(total_pnl - total_comm, 4)),
        win_count=win_count,
        loss_count=loss_count,
        win_rate=round(win_rate, 4),
        profit_factor=round(profit_factor, 4),
        avg_win=str(round(avg_win, 4)),
        avg_loss=str(round(avg_loss, 4)),
        avg_trade=str(round(avg_trade, 4)),
        max_single_win=str(round(max_win, 4)),
        max_single_loss=str(round(max_loss, 4)),
        best_day_pnl=str(round(best_day, 4)),
        worst_day_pnl=str(round(worst_day, 4)),
        daily_pnl=daily_series,
        by_symbol=symbol_breakdown,
    )
