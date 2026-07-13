# app/workers/sync_engine.py
# AlgoFin v1 — Core sync engine for Binance USDT-M Futures
#
# This module handles fetching and storing:
#   - Balances (USDT wallet balance for USDTM futures)
#   - Open positions
#   - Trade history (with realized PnL — the billing basis)
#
# BILLING CRITICAL (plan.md Section 5-A):
#   realized_pnl in trades comes from Binance API "realizedPnl" field.
#   Do NOT invent, derive, or double-subtract fees.
#   Funding payments are NOT included in realized_pnl.
#   If Binance API and CCXT values differ, log discrepancy and use Binance direct.

import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal

import ccxt.async_support as ccxt
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.exchanges.service import get_decrypted_credentials
from app.models.exchange import ExchangeSyncRun, UserExchangeAccount
from app.models.trading import Balance, Position, Trade

logger = logging.getLogger(__name__)


# ── Binance CCXT client ───────────────────────────────────────────

def _create_binance_futures_client(api_key: str, api_secret: str) -> ccxt.binanceusdm:
    """
    Create a Binance USDT-M Futures (binanceusdm) CCXT client.
    v1: Binance USDT-M Futures ONLY (plan.md Part 0-A).
    """
    return ccxt.binanceusdm({
        "apiKey":  api_key,
        "secret":  api_secret,
        "enableRateLimit": True,
        "options": {
            "defaultType": "future",
        },
    })


# ── Sync run ledger helpers ───────────────────────────────────────

async def _start_sync_run(
    db: AsyncSession,
    *,
    exchange_account_id: str,
    sync_type: str,
    triggered_by: str = "scheduler",
) -> ExchangeSyncRun:
    """Create and persist a sync run row with status='running'."""
    run = ExchangeSyncRun(
        exchange_account_id=exchange_account_id,
        sync_type=sync_type,
        status="running",
        triggered_by=triggered_by,
        started_at=datetime.now(timezone.utc),
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def _finish_sync_run(
    db: AsyncSession,
    run: ExchangeSyncRun,
    *,
    status: str,
    rows_processed: int = 0,
    error_message: str | None = None,
    error_code: str | None = None,
) -> None:
    """Update sync run to success/error/partial with finish timestamp."""
    run.status = status
    run.finished_at = datetime.now(timezone.utc)
    run.rows_processed = rows_processed
    run.error_message = error_message
    run.error_code = error_code
    await db.commit()


# ── Balance sync ──────────────────────────────────────────────────

async def sync_balances(
    db: AsyncSession,
    *,
    account: UserExchangeAccount,
    triggered_by: str = "scheduler",
) -> ExchangeSyncRun:
    """
    Fetch and upsert USDT-M Futures wallet balance.
    Updates account.sync_status and account.last_sync_at.
    """
    run = await _start_sync_run(
        db,
        exchange_account_id=str(account.id),
        sync_type="balances",
        triggered_by=triggered_by,
    )

    creds = await get_decrypted_credentials(db, exchange_account_id=str(account.id))
    if not creds:
        await _finish_sync_run(db, run, status="error", error_message="No credentials found")
        return run

    client = _create_binance_futures_client(creds["api_key"], creds["api_secret"])
    now = datetime.now(timezone.utc)

    try:
        raw = await client.fetch_balance({"type": "future"})

        # Binance USDT-M returns balance per asset
        rows = 0
        for asset, bal_data in raw.get("info", {}).get("assets", []) and {}:
            pass  # handled below

        # Use CCXT normalized structure
        usdt_balance = raw.get("USDT", {})
        if usdt_balance:
            wallet_balance = Decimal(str(usdt_balance.get("total", 0)))
            free_balance   = Decimal(str(usdt_balance.get("free", 0)))
            used_balance   = Decimal(str(usdt_balance.get("used", 0)))

            # Upsert USDT balance
            stmt = pg_insert(Balance).values(
                exchange_account_id=account.id,
                asset="USDT",
                wallet_balance=wallet_balance,
                unrealized_pnl=Decimal(str(raw.get("info", {}).get("totalUnrealizedProfit", 0))),
                margin_balance=wallet_balance + Decimal(str(raw.get("info", {}).get("totalUnrealizedProfit", 0))),
                available_balance=free_balance,
                synced_at=now,
            ).on_conflict_do_update(
                constraint="uq_balance_account_asset",
                set_={
                    "wallet_balance":    wallet_balance,
                    "unrealized_pnl":    Decimal(str(raw.get("info", {}).get("totalUnrealizedProfit", 0))),
                    "margin_balance":    wallet_balance + Decimal(str(raw.get("info", {}).get("totalUnrealizedProfit", 0))),
                    "available_balance": free_balance,
                    "synced_at":         now,
                },
            )
            await db.execute(stmt)
            rows = 1

        # Update account sync state
        account.sync_status = "connected"
        account.last_sync_at = now
        await db.commit()

        await _finish_sync_run(db, run, status="success", rows_processed=rows)
        logger.info(f"Balance sync complete for account {account.id}: {rows} rows")

    except Exception as exc:
        logger.exception(f"Balance sync failed for account {account.id}: {exc}")
        account.sync_status = "error"
        await db.commit()
        await _finish_sync_run(
            db, run, status="error",
            error_message=str(exc),
            error_code=type(exc).__name__,
        )
    finally:
        await client.close()

    return run


# ── Position sync ─────────────────────────────────────────────────

async def sync_positions(
    db: AsyncSession,
    *,
    account: UserExchangeAccount,
    triggered_by: str = "scheduler",
) -> ExchangeSyncRun:
    """
    Fetch current open positions from Binance USDTM Futures.
    Replaces all existing positions for the account (snapshot sync).
    unrealized_pnl stored for display ONLY — excluded from billing.
    """
    run = await _start_sync_run(
        db,
        exchange_account_id=str(account.id),
        sync_type="positions",
        triggered_by=triggered_by,
    )

    creds = await get_decrypted_credentials(db, exchange_account_id=str(account.id))
    if not creds:
        await _finish_sync_run(db, run, status="error", error_message="No credentials found")
        return run

    client = _create_binance_futures_client(creds["api_key"], creds["api_secret"])
    now = datetime.now(timezone.utc)

    try:
        positions_raw = await client.fetch_positions()

        # Delete existing positions for this account (snapshot replacement)
        from sqlalchemy import delete
        await db.execute(
            delete(Position).where(Position.exchange_account_id == account.id)
        )

        rows = 0
        for pos in positions_raw:
            size = Decimal(str(abs(pos.get("contracts", 0) or 0)))
            if size == 0:
                continue  # skip zero-size positions

            side = "long" if (pos.get("side") == "long" or float(pos.get("contracts", 0)) > 0) else "short"

            p = Position(
                exchange_account_id=account.id,
                symbol=pos.get("symbol", ""),
                side=side,
                size=size,
                entry_price=Decimal(str(pos.get("entryPrice", 0) or 0)),
                mark_price=Decimal(str(pos.get("markPrice", 0) or 0)),
                unrealized_pnl=Decimal(str(pos.get("unrealizedPnl", 0) or 0)),
                # unrealized_pnl: display only, NOT included in billing
                leverage=Decimal(str(pos.get("leverage", 1) or 1)),
                margin_type=pos.get("marginType", "cross"),
                last_updated_at=now,
                synced_at=now,
            )
            db.add(p)
            rows += 1

        account.sync_status = "connected"
        account.last_sync_at = now
        await db.commit()

        await _finish_sync_run(db, run, status="success", rows_processed=rows)
        logger.info(f"Position sync complete for account {account.id}: {rows} positions")

    except Exception as exc:
        logger.exception(f"Position sync failed for account {account.id}: {exc}")
        account.sync_status = "error"
        await db.commit()
        await _finish_sync_run(
            db, run, status="error",
            error_message=str(exc),
            error_code=type(exc).__name__,
        )
    finally:
        await client.close()

    return run


# ── Trade sync ────────────────────────────────────────────────────

async def sync_trades(
    db: AsyncSession,
    *,
    account: UserExchangeAccount,
    triggered_by: str = "scheduler",
    since_ms: int | None = None,
) -> ExchangeSyncRun:
    """
    Fetch trade history from Binance USDTM Futures.
    Uses incremental sync (since last known trade_time).

    BILLING CRITICAL:
      - realized_pnl = Binance API 'realizedPnl' field directly
      - Do NOT deduct commission from realized_pnl
      - Funding payments come via different endpoint — NOT included here
      - plan.md Section 5-A Data Source Rules.
    """
    run = await _start_sync_run(
        db,
        exchange_account_id=str(account.id),
        sync_type="trades",
        triggered_by=triggered_by,
    )

    creds = await get_decrypted_credentials(db, exchange_account_id=str(account.id))
    if not creds:
        await _finish_sync_run(db, run, status="error", error_message="No credentials found")
        return run

    client = _create_binance_futures_client(creds["api_key"], creds["api_secret"])
    now = datetime.now(timezone.utc)

    try:
        # Determine since: use last known trade or go back 30 days
        if since_ms is None:
            from sqlalchemy import func as sqlfunc
            last_result = await db.execute(
                select(sqlfunc.max(Trade.trade_time)).where(
                    Trade.exchange_account_id == account.id
                )
            )
            last_trade_time = last_result.scalar_one_or_none()
            if last_trade_time:
                since_ms = int(last_trade_time.timestamp() * 1000) + 1
            else:
                # First sync: go back 90 days
                from datetime import timedelta
                since_ms = int((now.timestamp() - 90 * 86400) * 1000)

        # Fetch all active markets for this futures account
        # We need to iterate symbols to get all trades
        markets = await client.load_markets()
        futures_symbols = [
            s for s, m in markets.items()
            if m.get("type") == "future" and m.get("settle") == "USDT"
        ]

        total_rows = 0
        for symbol in futures_symbols[:50]:  # cap per sync to avoid rate limits
            try:
                trades_raw = await client.fetch_my_trades(symbol, since=since_ms, limit=1000)
                if not trades_raw:
                    continue

                for t in trades_raw:
                    info = t.get("info", {})
                    realized_pnl_raw = info.get("realizedPnl", "0") or "0"
                    # Use Binance API realizedPnl field directly — plan.md Section 5-A
                    realized_pnl = Decimal(str(realized_pnl_raw))

                    trade_time = datetime.fromtimestamp(
                        t["timestamp"] / 1000, tz=timezone.utc
                    )

                    stmt = pg_insert(Trade).values(
                        exchange_account_id=account.id,
                        binance_trade_id=str(t.get("id", "")),
                        order_id=str(info.get("orderId", t.get("order", ""))),
                        symbol=t.get("symbol", symbol),
                        side=t.get("side", "buy"),
                        price=Decimal(str(t.get("price", 0) or 0)),
                        qty=Decimal(str(t.get("amount", 0) or 0)),
                        realized_pnl=realized_pnl,
                        commission=Decimal(str(t.get("fee", {}).get("cost", 0) or 0)),
                        commission_asset=t.get("fee", {}).get("currency", "USDT") or "USDT",
                        is_maker=t.get("takerOrMaker") == "maker",
                        trade_time=trade_time,
                        synced_at=now,
                    ).on_conflict_do_update(
                        constraint="uq_trade_account_binance_id",
                        set_={
                            "realized_pnl": realized_pnl,
                            "synced_at":    now,
                        },
                    )
                    await db.execute(stmt)
                    total_rows += 1

            except Exception as symbol_exc:
                logger.warning(f"Trade sync skipped symbol {symbol}: {symbol_exc}")
                continue

        account.sync_status = "connected"
        account.last_sync_at = now
        await db.commit()

        await _finish_sync_run(db, run, status="success", rows_processed=total_rows)
        logger.info(f"Trade sync complete for account {account.id}: {total_rows} trades")

    except Exception as exc:
        logger.exception(f"Trade sync failed for account {account.id}: {exc}")
        account.sync_status = "error"
        await db.commit()
        await _finish_sync_run(
            db, run, status="error",
            error_message=str(exc),
            error_code=type(exc).__name__,
        )
    finally:
        await client.close()

    return run


# ── Full sync ─────────────────────────────────────────────────────

async def sync_full(
    db: AsyncSession,
    *,
    account: UserExchangeAccount,
    triggered_by: str = "scheduler",
) -> list[ExchangeSyncRun]:
    """Run balances + positions + trades in sequence."""
    runs = []
    runs.append(await sync_balances(db, account=account, triggered_by=triggered_by))
    runs.append(await sync_positions(db, account=account, triggered_by=triggered_by))
    runs.append(await sync_trades(db, account=account, triggered_by=triggered_by))
    return runs
