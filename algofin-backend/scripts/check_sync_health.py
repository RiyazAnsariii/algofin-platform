#!/usr/bin/env python3
"""
AlgoFin v1 — Sync Health Check
================================
Run after the Docker stack is up and at least one sync has run.

Usage:
    # With backend running and DB accessible
    DATABASE_URL=postgresql://algofin:algofin_dev_password@localhost:5432/algofin \
    python scripts/check_sync_health.py

Checks:
    [1] All active exchange accounts have at least one sync_run row
    [2] No accounts are stuck in 'running' status > 10 min
    [3] Each account has balance/position/trade data in DB
    [4] data_freshness thresholds computed correctly
    [5] calculate_period_pnl() runs without error and returns sensible values
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal


async def run_checks(database_url: str) -> bool:
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select, func, and_

    # Ensure asyncpg URL format
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    all_passed = True

    async with Session() as db:
        # ── Import models ───────────────────────────────────────
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        from app.models.exchange import UserExchangeAccount, ExchangeSyncRun
        from app.models.trading import Balance, Position, Trade

        print("=" * 60)
        print("AlgoFin — Sync Health Check")
        print("=" * 60)

        # ── CHECK 1: Active accounts ────────────────────────────
        accounts_result = await db.execute(
            select(UserExchangeAccount).where(UserExchangeAccount.is_active == True)  # noqa: E712
        )
        accounts = accounts_result.scalars().all()
        print(f"\n[1] Active exchange accounts: {len(accounts)}")

        if not accounts:
            print("    ⚠️  No active accounts found. Connect an account first via:")
            print("    POST /api/v1/exchanges/connect")
            return False

        for acct in accounts:
            print(f"    • {acct.label} ({acct.exchange_id}) — sync_status={acct.sync_status}")
            print(f"      billing_consent={acct.billing_consent}, last_sync_at={acct.last_sync_at}")

        # ── CHECK 2: Sync runs exist ────────────────────────────
        print(f"\n[2] Sync run ledger (exchange_sync_runs):")
        for acct in accounts:
            runs_result = await db.execute(
                select(ExchangeSyncRun)
                .where(ExchangeSyncRun.exchange_account_id == acct.id)
                .order_by(ExchangeSyncRun.started_at.desc())
                .limit(5)
            )
            runs = runs_result.scalars().all()
            if not runs:
                print(f"    ❌ {acct.label}: No sync runs found. Trigger sync via POST /exchanges/{acct.id}/sync")
                all_passed = False
            else:
                latest = runs[0]
                print(f"    ✅ {acct.label}: {len(runs)} run(s). Latest: {latest.sync_type} → {latest.status} ({latest.started_at.strftime('%H:%M:%S')})")

        # ── CHECK 3: Stuck jobs ─────────────────────────────────
        print(f"\n[3] Stuck sync jobs (running > 10 min):")
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
        stuck_result = await db.execute(
            select(ExchangeSyncRun).where(
                ExchangeSyncRun.status == "running",
                ExchangeSyncRun.started_at < cutoff,
            )
        )
        stuck = stuck_result.scalars().all()
        if stuck:
            print(f"    ❌ Found {len(stuck)} stuck sync run(s):")
            for s in stuck:
                print(f"       ID={s.id}, account={s.exchange_account_id}, type={s.sync_type}, started={s.started_at}")
            all_passed = False
        else:
            print("    ✅ No stuck jobs")

        # ── CHECK 4: Data in tables ─────────────────────────────
        print(f"\n[4] Data counts:")
        account_ids = [str(a.id) for a in accounts]

        bal_count = (await db.execute(
            select(func.count(Balance.id)).where(Balance.exchange_account_id.in_(account_ids))
        )).scalar_one_or_none() or 0
        pos_count = (await db.execute(
            select(func.count(Position.id)).where(Position.exchange_account_id.in_(account_ids))
        )).scalar_one_or_none() or 0
        trade_count = (await db.execute(
            select(func.count(Trade.id)).where(Trade.exchange_account_id.in_(account_ids))
        )).scalar_one_or_none() or 0

        print(f"    balances:  {bal_count} row(s)")
        print(f"    positions: {pos_count} row(s)")
        print(f"    trades:    {trade_count} row(s)")

        if bal_count == 0:
            print("    ❌ No balance data — run balance sync first")
            all_passed = False
        else:
            print("    ✅ Balance data present")

        # Positions may be 0 if no open positions — that's valid
        if pos_count == 0:
            print("    ℹ️  No open positions (or sync not run yet — check exchange_sync_runs)")

        if trade_count == 0:
            print("    ⚠️  No trades — PnL calculation will return $0.00")
            print("       If this account has trades, check BINANCE_API_KEY permissions")
        else:
            print(f"    ✅ Trade data present: {trade_count} fills")

        # ── CHECK 5: calculate_period_pnl() sanity ──────────────
        print(f"\n[5] calculate_period_pnl() sanity check:")
        try:
            from app.portfolio.pnl import calculate_period_pnl
            from datetime import date
            import calendar

            today = date.today()
            period_start = date(today.year, today.month, 1)
            period_end = today

            # Use first account's user_id
            first_user_id = str(accounts[0].user_id)
            result = await calculate_period_pnl(
                db,
                user_id=first_user_id,
                period_start=period_start,
                period_end=period_end,
            )
            print(f"    user_id:               {first_user_id}")
            print(f"    period:                {period_start} → {period_end}")
            print(f"    consented_accounts:    {result.consented_account_ids}")
            print(f"    total_realized_pnl:    {result.total_realized_pnl} USDT")
            print(f"    performance_fee_rate:  {result.performance_fee_rate}")
            print(f"    performance_fee_amount:{result.performance_fee_amount} USDT")
            print(f"    is_complete:           {result.is_complete}")
            if not result.is_complete:
                print(f"    incomplete_reason:     {result.incomplete_reason}")
            print("    ✅ calculate_period_pnl() executed without error")

        except Exception as exc:
            print(f"    ❌ calculate_period_pnl() raised: {exc}")
            all_passed = False

        # ── CHECK 6: data_freshness ─────────────────────────────
        print(f"\n[6] data_freshness computation:")
        try:
            from app.common.staleness import compute_data_freshness
            from sqlalchemy import func as sqlfunc

            bal_ts = (await db.execute(
                select(sqlfunc.max(Balance.synced_at)).where(Balance.exchange_account_id.in_(account_ids))
            )).scalar_one_or_none()
            pos_ts = (await db.execute(
                select(sqlfunc.max(Position.synced_at)).where(Position.exchange_account_id.in_(account_ids))
            )).scalar_one_or_none()
            trade_ts = (await db.execute(
                select(sqlfunc.max(Trade.synced_at)).where(Trade.exchange_account_id.in_(account_ids))
            )).scalar_one_or_none()

            freshness = compute_data_freshness(bal_ts, pos_ts, trade_ts)
            for k, v in freshness.items():
                stale_icon = "⚠️ STALE" if v["is_stale"] else "✅ fresh"
                print(f"    {k:<12}: synced_at={v['synced_at'] or 'never'} [{stale_icon}]")

        except Exception as exc:
            print(f"    ❌ data_freshness computation failed: {exc}")
            all_passed = False

    await engine.dispose()

    print("\n" + "=" * 60)
    if all_passed:
        print("✅ SYNC HEALTH: ALL CHECKS PASSED")
        print("Phase C database verification complete.")
    else:
        print("❌ SYNC HEALTH: SOME CHECKS FAILED — see above for details")

    print("=" * 60)
    return all_passed


def main() -> None:
    database_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://algofin:algofin_dev_password@localhost:5432/algofin"
    )
    print(f"Connecting to: {database_url.split('@')[-1]}")
    result = asyncio.run(run_checks(database_url))
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
