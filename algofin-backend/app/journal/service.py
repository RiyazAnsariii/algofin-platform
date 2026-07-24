# app/journal/service.py
# AlgoFin — Journal Analytics & Export Service Layer (SQL Aggregations)

import csv
import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.journal.schemas import (
    CumulativePnLPoint,
    DailyPnL,
    JournalAnalyticsResponse,
    JournalSummary,
    PnLDistributionBucket,
    SymbolBreakdown,
    TradePerformancePoint,
    WinLossRatio,
)
from app.models.exchange import UserExchangeAccount
from app.models.trading import Trade


def parse_period_and_dates(
    period: str | None = "30D",
    start_date: str | date | datetime | None = None,
    end_date: str | date | datetime | None = None,
    days: int | None = None,
) -> tuple[datetime | None, datetime | None, int]:
    """
    Parses period strings ('7D', '30D', '90D', '1Y', 'ALL') or custom dates into UTC datetimes.
    """
    tz = timezone.utc
    now = datetime.now(tz)

    # Legacy fallback if days integer is supplied
    if days is not None and not period:
        if days == 7:
            period = "7D"
        elif days == 30:
            period = "30D"
        elif days == 90:
            period = "90D"
        elif days >= 365 and days < 9000:
            period = "1Y"
        elif days >= 9000:
            period = "ALL"

    period_str = (period or "30D").upper().strip()

    from_dt: datetime | None = None
    to_dt: datetime | None = None
    period_days: int = 30

    if start_date:
        if isinstance(start_date, (date, datetime)):
            from_dt = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0, tzinfo=tz)
        else:
            s_str = str(start_date).strip()
            if len(s_str) >= 10:
                d = date.fromisoformat(s_str[:10])
                from_dt = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=tz)

    if end_date:
        if isinstance(end_date, (date, datetime)):
            to_dt = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=tz)
        else:
            e_str = str(end_date).strip()
            if len(e_str) >= 10:
                d = date.fromisoformat(e_str[:10])
                to_dt = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=tz)

    if not from_dt:
        if period_str == "7D":
            period_days = 7
            from_dt = now - timedelta(days=7)
        elif period_str == "30D":
            period_days = 30
            from_dt = now - timedelta(days=30)
        elif period_str == "90D":
            period_days = 90
            from_dt = now - timedelta(days=90)
        elif period_str == "1Y":
            period_days = 365
            from_dt = now - timedelta(days=365)
        elif period_str == "ALL":
            period_days = 9999
            from_dt = None
        else:
            period_days = 30
            from_dt = now - timedelta(days=30)

    if from_dt and to_dt:
        period_days = max(1, (to_dt - from_dt).days)

    return from_dt, to_dt, period_days


async def get_user_account_ids(db: AsyncSession, user_id: str) -> list[str]:
    result = await db.execute(
        select(UserExchangeAccount.id).where(
            UserExchangeAccount.user_id == user_id,
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    return [str(r) for r in result.scalars().all()]


async def get_journal_analytics(
    db: AsyncSession,
    user_id: str,
    period: str | None = "30D",
    start_date: str | date | datetime | None = None,
    end_date: str | date | datetime | None = None,
    days: int | None = None,
) -> JournalAnalyticsResponse:
    from_dt, to_dt, period_days = parse_period_and_dates(period, start_date, end_date, days)

    account_ids = await get_user_account_ids(db, user_id)
    empty_dist = [
        PnLDistributionBucket(range="<-200", count=0),
        PnLDistributionBucket(range="-200~-100", count=0),
        PnLDistributionBucket(range="-100~0", count=0),
        PnLDistributionBucket(range="0~100", count=0),
        PnLDistributionBucket(range="100~200", count=0),
        PnLDistributionBucket(range=">200", count=0),
    ]

    from_str = from_dt.date().isoformat() if from_dt else "all-time"
    to_str = to_dt.date().isoformat() if to_dt else datetime.now(timezone.utc).date().isoformat()

    if not account_ids:
        return JournalAnalyticsResponse(
            summary=JournalSummary(),
            cumulative_pnl=[],
            win_loss_ratio=WinLossRatio(),
            trade_performance=[],
            pnl_distribution=empty_dist,
            period_days=period_days,
            from_date=from_str,
            to_date=to_str,
        )

    # Filtering closed trades (realized_pnl != 0)
    conditions = [
        Trade.exchange_account_id.in_(account_ids),
        Trade.realized_pnl != Decimal("0"),
    ]
    if from_dt:
        conditions.append(Trade.trade_time >= from_dt)
    if to_dt:
        conditions.append(Trade.trade_time <= to_dt)

    # SQL Aggregations for summary stats
    agg_query = select(
        func.count(Trade.id).label("total_trades"),
        func.count(case((Trade.realized_pnl > 0, Trade.id))).label("win_count"),
        func.count(case((Trade.realized_pnl < 0, Trade.id))).label("loss_count"),
        func.coalesce(func.sum(Trade.realized_pnl - Trade.commission), Decimal("0")).label("net_pnl"),
        func.coalesce(func.sum(Trade.realized_pnl), Decimal("0")).label("total_realized_pnl"),
        func.coalesce(func.sum(Trade.commission), Decimal("0")).label("total_commission"),
        func.coalesce(func.sum(case((Trade.realized_pnl > 0, Trade.realized_pnl), else_=Decimal("0"))), Decimal("0")).label("gross_profit"),
        func.coalesce(func.sum(case((Trade.realized_pnl < 0, Trade.realized_pnl), else_=Decimal("0"))), Decimal("0")).label("gross_loss"),
        func.coalesce(func.avg(case((Trade.realized_pnl > 0, Trade.realized_pnl))), Decimal("0")).label("avg_win"),
        func.coalesce(func.avg(case((Trade.realized_pnl < 0, Trade.realized_pnl))), Decimal("0")).label("avg_loss"),
        func.coalesce(func.max(case((Trade.realized_pnl > 0, Trade.realized_pnl))), Decimal("0")).label("max_win"),
        func.coalesce(func.min(case((Trade.realized_pnl < 0, Trade.realized_pnl))), Decimal("0")).label("max_loss"),
    ).where(and_(*conditions))

    res = await db.execute(agg_query)
    agg = res.one()

    total_trades = agg.total_trades or 0
    if total_trades == 0:
        return JournalAnalyticsResponse(
            summary=JournalSummary(),
            cumulative_pnl=[],
            win_loss_ratio=WinLossRatio(),
            trade_performance=[],
            pnl_distribution=empty_dist,
            period_days=period_days,
            from_date=from_str,
            to_date=to_str,
        )

    win_count = agg.win_count or 0
    loss_count = agg.loss_count or 0
    net_pnl = float(agg.net_pnl or 0)
    total_realized_pnl = float(agg.total_realized_pnl or 0)
    total_commission = float(agg.total_commission or 0)
    gross_profit = float(agg.gross_profit or 0)
    gross_loss = float(agg.gross_loss or 0)
    avg_win = float(agg.avg_win or 0)
    avg_loss = float(agg.avg_loss or 0)
    max_win = float(agg.max_win or 0)
    max_loss = float(agg.max_loss or 0)

    # Win Rate & Profit Factor calculations
    win_rate_pct = round((win_count / total_trades) * 100.0, 2)
    win_rate_ratio = round(win_count / total_trades, 4)

    # Profit Factor = Gross Profit / Absolute Gross Loss. If Gross Loss == 0 return 0.
    if gross_loss == 0 or abs(gross_loss) == 0:
        profit_factor = 0.0
    else:
        profit_factor = round(gross_profit / abs(gross_loss), 2)

    win_percent = round((win_count / total_trades) * 100.0, 2)
    loss_percent = round((loss_count / total_trades) * 100.0, 2)

    # Chronological trades for trade performance & cumulative daily PnL
    trades_query = select(
        Trade.trade_time,
        Trade.realized_pnl,
        Trade.commission,
        Trade.symbol,
    ).where(and_(*conditions)).order_by(Trade.trade_time.asc())

    t_res = await db.execute(trades_query)
    trade_rows = t_res.all()

    trade_performance: list[TradePerformancePoint] = []
    daily_map: dict[str, dict] = {}
    pnl_dist_counts = {"<-200": 0, "-200~-100": 0, "-100~0": 0, "0~100": 0, "100~200": 0, ">200": 0}
    by_sym: dict[str, dict] = {}

    for idx, tr in enumerate(trade_rows, start=1):
        net_t_pnl = float(tr.realized_pnl - tr.commission)
        realized_t_pnl = float(tr.realized_pnl)

        trade_performance.append(TradePerformancePoint(
            trade_number=idx,
            realized_pnl=round(net_t_pnl, 2),
        ))

        # PnL distribution buckets
        if net_t_pnl < -200:
            pnl_dist_counts["<-200"] += 1
        elif -200 <= net_t_pnl < -100:
            pnl_dist_counts["-200~-100"] += 1
        elif -100 <= net_t_pnl < 0:
            pnl_dist_counts["-100~0"] += 1
        elif 0 <= net_t_pnl <= 100:
            pnl_dist_counts["0~100"] += 1
        elif 100 < net_t_pnl <= 200:
            pnl_dist_counts["100~200"] += 1
        else:
            pnl_dist_counts[">200"] += 1

        # Daily mapping
        d_str = tr.trade_time.strftime("%Y-%m-%d")
        if d_str not in daily_map:
            daily_map[d_str] = {"pnl": 0.0, "count": 0}
        daily_map[d_str]["pnl"] += net_t_pnl
        daily_map[d_str]["count"] += 1

        # Symbol mapping
        sym = tr.symbol
        if sym not in by_sym:
            by_sym[sym] = {"count": 0, "pnl": 0.0, "wins": 0, "losses": 0}
        by_sym[sym]["count"] += 1
        by_sym[sym]["pnl"] += net_t_pnl
        if realized_t_pnl > 0:
            by_sym[sym]["wins"] += 1
        elif realized_t_pnl < 0:
            by_sym[sym]["losses"] += 1

    # Daily series, cumulative PnL, best & worst day
    cumulative_pnl: list[CumulativePnLPoint] = []
    daily_pnl_series: list[DailyPnL] = []
    running_total = 0.0
    best_day: float | None = None
    worst_day: float | None = None

    sorted_dates = sorted(daily_map.keys())
    for d_str in sorted_dates:
        d_pnl = daily_map[d_str]["pnl"]
        running_total += d_pnl

        if best_day is None or d_pnl > best_day:
            best_day = d_pnl
        if worst_day is None or d_pnl < worst_day:
            worst_day = d_pnl

        cumulative_pnl.append(CumulativePnLPoint(
            date=d_str,
            daily_realized_pnl=round(d_pnl, 2),
            running_total=round(running_total, 2),
        ))
        daily_pnl_series.append(DailyPnL(
            date=d_str,
            pnl=str(round(d_pnl, 4)),
            trade_count=daily_map[d_str]["count"],
            cumulative_pnl=str(round(running_total, 4)),
        ))

    best_day_val = round(best_day, 2) if best_day is not None else 0.0
    worst_day_val = round(worst_day, 2) if worst_day is not None else 0.0

    pnl_distribution = [
        PnLDistributionBucket(range=k, count=v)
        for k, v in pnl_dist_counts.items()
    ]

    summary = JournalSummary(
        total_trades=total_trades,
        win_rate=win_rate_pct,
        profit_factor=profit_factor,
        net_pnl=round(net_pnl, 2),
        avg_win=round(avg_win, 2),
        avg_loss=round(avg_loss, 2),
        best_day=best_day_val,
        worst_day=worst_day_val,
    )

    win_loss_ratio = WinLossRatio(
        wins=win_count,
        losses=loss_count,
        win_percent=win_percent,
        loss_percent=loss_percent,
    )

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

    return JournalAnalyticsResponse(
        summary=summary,
        cumulative_pnl=cumulative_pnl,
        win_loss_ratio=win_loss_ratio,
        trade_performance=trade_performance,
        pnl_distribution=pnl_distribution,
        period_days=period_days,
        from_date=from_str,
        to_date=to_str,
        total_trades=total_trades,
        realized_pnl=str(round(total_realized_pnl, 4)),
        total_commission=str(round(total_commission, 4)),
        net_pnl=str(round(net_pnl, 4)),
        win_count=win_count,
        loss_count=loss_count,
        win_rate=win_rate_ratio,
        profit_factor=profit_factor,
        avg_win=str(round(avg_win, 4)),
        avg_loss=str(round(avg_loss, 4)),
        avg_trade=str(round(net_pnl / total_trades, 4)) if total_trades else "0",
        max_single_win=str(round(max_win, 4)),
        max_single_loss=str(round(max_loss, 4)),
        best_day_pnl=str(round(best_day_val, 4)),
        worst_day_pnl=str(round(worst_day_val, 4)),
        daily_pnl=daily_pnl_series,
        by_symbol=symbol_breakdown,
    )


async def generate_journal_csv(
    db: AsyncSession,
    user_id: str,
    period: str | None = "30D",
    start_date: str | date | datetime | None = None,
    end_date: str | date | datetime | None = None,
    days: int | None = None,
) -> str:
    from_dt, to_dt, _ = parse_period_and_dates(period, start_date, end_date, days)
    account_ids = await get_user_account_ids(db, user_id)

    output = io.StringIO()
    writer = csv.writer(output)
    headers = [
        "Close Time",
        "Symbol",
        "Side",
        "Entry Price",
        "Exit Price",
        "Quantity",
        "Realized PnL",
        "Commission",
        "ROI %",
    ]
    writer.writerow(headers)

    if not account_ids:
        return output.getvalue()

    conditions = [
        Trade.exchange_account_id.in_(account_ids),
        Trade.realized_pnl != Decimal("0"),
    ]
    if from_dt:
        conditions.append(Trade.trade_time >= from_dt)
    if to_dt:
        conditions.append(Trade.trade_time <= to_dt)

    q = select(Trade).where(and_(*conditions)).order_by(Trade.trade_time.desc())
    res = await db.execute(q)
    trades = res.scalars().all()

    for t in trades:
        close_time = t.trade_time.strftime("%Y-%m-%d %H:%M:%S")
        symbol = t.symbol
        side = t.side.upper()
        price = float(t.price)
        qty = float(t.qty)
        pnl = float(t.realized_pnl)
        comm = float(t.commission)

        trade_val = price * qty
        roi_pct = round((pnl / trade_val) * 100.0, 2) if trade_val > 0 else 0.0

        writer.writerow([
            close_time,
            symbol,
            side,
            f"{price:.2f}",
            f"{price:.2f}",
            f"{qty:.4f}",
            f"{pnl:.4f}",
            f"{comm:.4f}",
            f"{roi_pct:.2f}%",
        ])

    return output.getvalue()
