# app/workers/sync_engine.py
# AlgoFin v2 — Phase J: Multi-Exchange sync engine
#
# Handles balances, positions, and trades for ALL supported exchanges:
#   binance_usdtm  — Binance USDT-M Futures (live)
#   bybit_linear   — Bybit Linear Perpetuals (live)
#   coinbase_advanced — Coinbase Advanced Trade (live — spot)
#   delta_futures  — Delta Exchange Futures & Options (live)
#
# Exchange-agnostic: the CCXT client is selected by exchange_id.
# Each sync function delegates to the right client via ccxt_adapter.
#
# BILLING CRITICAL (plan.md Section 5-A):
#   realized_pnl = exchange API 'realizedPnl' field ONLY.
#   Funding payments excluded. Fees not double-subtracted.

import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.exchanges.ccxt_adapter import (
    create_ccxt_client,
    get_market_filter,
    is_futures_exchange,
)
from app.exchanges.service import get_decrypted_credentials
from app.models.exchange import ExchangeSyncRun, UserExchangeAccount
from app.models.trading import Balance, Position, Trade
from app.config import settings

logger = logging.getLogger(__name__)


# ── Decimal helper ────────────────────────────────────────────────


def _dec(val, default: str = "0") -> Decimal:
    """Safely convert to Decimal, returning default on failure."""
    try:
        return Decimal(str(val)) if val is not None else Decimal(default)
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


# ── Upsert helper (SQLite + PostgreSQL compatible) ─────────────────


async def _upsert_balance(
    db: AsyncSession, *, exchange_account_id, asset: str, **fields
):
    """Upsert a balance row — works on both SQLite (dev) and PostgreSQL (prod)."""
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    if "sqlite" in settings.database_url:
        stmt = (
            sqlite_insert(Balance)
            .values(exchange_account_id=exchange_account_id, asset=asset, **fields)
            .on_conflict_do_update(
                index_elements=["exchange_account_id", "asset"],
                set_=fields,
            )
        )
    else:
        stmt = (
            pg_insert(Balance)
            .values(exchange_account_id=exchange_account_id, asset=asset, **fields)
            .on_conflict_do_update(
                constraint="uq_balance_account_asset",
                set_=fields,
            )
        )
    await db.execute(stmt)


async def _upsert_trade(
    db: AsyncSession, *, exchange_account_id, trade_id: str, **fields
):
    """Upsert a trade row — works on both SQLite (dev) and PostgreSQL (prod)."""
    from sqlalchemy.dialects.sqlite import insert as sqlite_insert
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    if "sqlite" in settings.database_url:
        stmt = (
            sqlite_insert(Trade)
            .values(
                exchange_account_id=exchange_account_id,
                binance_trade_id=trade_id,
                **fields,
            )
            .on_conflict_do_update(
                index_elements=["exchange_account_id", "binance_trade_id"],
                set_={
                    k: v
                    for k, v in fields.items()
                    if k in ("realized_pnl", "synced_at")
                },
            )
        )
    else:
        stmt = (
            pg_insert(Trade)
            .values(
                exchange_account_id=exchange_account_id,
                binance_trade_id=trade_id,
                **fields,
            )
            .on_conflict_do_update(
                constraint="uq_trade_account_binance_id",
                set_={
                    k: v
                    for k, v in fields.items()
                    if k in ("realized_pnl", "synced_at")
                },
            )
        )
    await db.execute(stmt)


# ── Sync run ledger helpers ───────────────────────────────────────


async def _start_sync_run(
    db: AsyncSession,
    *,
    exchange_account_id: str,
    sync_type: str,
    triggered_by: str = "scheduler",
) -> ExchangeSyncRun:
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
    Fetch and upsert wallet balance for any supported exchange.
    For futures: USDT balance + unrealized PnL.
    For spot (Coinbase): per-asset balances.
    """
    run = await _start_sync_run(
        db,
        exchange_account_id=str(account.id),
        sync_type="balances",
        triggered_by=triggered_by,
    )

    creds = await get_decrypted_credentials(db, exchange_account_id=str(account.id))
    if not creds or not creds.get("api_key"):
        await _finish_sync_run(
            db, run, status="error", error_message="No credentials found"
        )
        return run

    client = create_ccxt_client(
        exchange_id=account.exchange_id,
        api_key=creds["api_key"],
        api_secret=creds["api_secret"],
        passphrase=creds.get("passphrase"),
    )
    now = datetime.now(timezone.utc)
    rows = 0

    try:
        # Fetch balance — options differ by exchange
        fetch_options: dict = {}
        if account.exchange_id == "binance_usdtm":
            fetch_options = {"type": "future"}
        elif account.exchange_id == "bybit_linear":
            fetch_options = {"type": "linear"}

        raw = await client.fetch_balance(fetch_options)
        info = raw.get("info", {})

        if account.exchange_id == "binance_usdtm":
            usdt = raw.get("USDT", {})
            total_unrealized = _dec(info.get("totalUnrealizedProfit", 0))
            fields = dict(
                wallet_balance=_dec(usdt.get("total", 0)),
                unrealized_pnl=total_unrealized,
                margin_balance=_dec(usdt.get("total", 0)) + total_unrealized,
                available_balance=_dec(usdt.get("free", 0)),
                synced_at=now,
            )
            await _upsert_balance(
                db, exchange_account_id=account.id, asset="USDT", **fields
            )
            rows = 1

        elif account.exchange_id == "bybit_linear":
            # Bybit: balance in info.result.list[].coin[]
            accounts_list = info.get("result", {}).get("list", []) or info.get(
                "list", []
            )
            for acct_info in accounts_list:
                for coin in acct_info.get("coin", []):
                    asset = coin.get("coin", "")
                    if asset != "USDT":
                        continue
                    fields = dict(
                        wallet_balance=_dec(coin.get("walletBalance", 0)),
                        unrealized_pnl=_dec(coin.get("unrealisedPnl", 0)),
                        margin_balance=_dec(coin.get("equity", 0)),
                        available_balance=_dec(coin.get("availableToWithdraw", 0)),
                        synced_at=now,
                    )
                    await _upsert_balance(
                        db, exchange_account_id=account.id, asset="USDT", **fields
                    )
                    rows += 1

        elif account.exchange_id == "delta_futures":
            # Delta Exchange: CCXT USDT dict or raw.get("USDT")
            usdt = raw.get("USDT", {})
            total_bal = _dec(usdt.get("total", 0))
            free_bal = _dec(usdt.get("free", 0))
            fields = dict(
                wallet_balance=total_bal,
                unrealized_pnl=Decimal("0"),
                margin_balance=total_bal,
                available_balance=free_bal,
                synced_at=now,
            )
            await _upsert_balance(
                db, exchange_account_id=account.id, asset="USDT", **fields
            )
            rows = 1

        else:
            # Coinbase / other: upsert all non-zero USDT-adjacent assets
            for asset, bal_data in raw.get("total", {}).items():
                if _dec(bal_data) == 0:
                    continue
                fields = dict(
                    wallet_balance=_dec(bal_data),
                    unrealized_pnl=Decimal("0"),
                    margin_balance=_dec(bal_data),
                    available_balance=_dec(raw.get("free", {}).get(asset, 0)),
                    synced_at=now,
                )
                await _upsert_balance(
                    db, exchange_account_id=account.id, asset=asset, **fields
                )
                rows += 1

        account.sync_status = "connected"
        account.last_sync_at = now
        await db.commit()
        await _finish_sync_run(db, run, status="success", rows_processed=rows)
        logger.info(
            f"[{account.exchange_id}] Balance sync OK account={account.id} rows={rows}"
        )

    except Exception as exc:
        logger.exception(
            f"[{account.exchange_id}] Balance sync FAILED account={account.id}: {exc}"
        )
        account.sync_status = "error"
        await db.commit()
        await _finish_sync_run(
            db,
            run,
            status="error",
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
    Fetch and snapshot open positions for any futures exchange.
    Spot exchanges (Coinbase) return an empty set — no positions.
    unrealized_pnl stored for display ONLY — excluded from billing (plan.md 5-A).
    """
    run = await _start_sync_run(
        db,
        exchange_account_id=str(account.id),
        sync_type="positions",
        triggered_by=triggered_by,
    )

    if not is_futures_exchange(account.exchange_id):
        # Spot account — no positions concept
        await _finish_sync_run(
            db,
            run,
            status="success",
            rows_processed=0,
            error_message="Spot account — no positions",
        )
        return run

    creds = await get_decrypted_credentials(db, exchange_account_id=str(account.id))
    if not creds or not creds.get("api_key"):
        await _finish_sync_run(
            db, run, status="error", error_message="No credentials found"
        )
        return run

    client = create_ccxt_client(
        exchange_id=account.exchange_id,
        api_key=creds["api_key"],
        api_secret=creds["api_secret"],
        passphrase=creds.get("passphrase"),
    )
    now = datetime.now(timezone.utc)

    try:
        positions_raw = await client.fetch_positions()

        # Snapshot: delete existing positions for this account
        await db.execute(
            delete(Position).where(Position.exchange_account_id == account.id)
        )

        rows = 0
        for pos in positions_raw:
            contracts = pos.get("contracts") or pos.get("info", {}).get("size", 0)
            size = _dec(abs(float(contracts or 0)))
            if size == 0:
                continue

            side_raw = pos.get("side") or (
                "long" if float(contracts or 0) > 0 else "short"
            )
            side = "long" if side_raw in ("long", "buy") else "short"

            p = Position(
                exchange_account_id=account.id,
                symbol=pos.get("symbol", ""),
                side=side,
                size=size,
                entry_price=_dec(
                    pos.get("entryPrice") or pos.get("info", {}).get("avgPrice", 0)
                ),
                mark_price=_dec(
                    pos.get("markPrice") or pos.get("info", {}).get("markPrice", 0)
                ),
                unrealized_pnl=_dec(
                    pos.get("unrealizedPnl")
                    or pos.get("info", {}).get("unrealisedPnl", 0)
                ),
                leverage=_dec(pos.get("leverage") or 1),
                margin_type=pos.get("marginType")
                or pos.get("info", {}).get("tradeMode", "cross"),
                last_updated_at=now,
                synced_at=now,
            )
            db.add(p)
            rows += 1

        account.sync_status = "connected"
        account.last_sync_at = now
        await db.commit()
        await _finish_sync_run(db, run, status="success", rows_processed=rows)
        logger.info(
            f"[{account.exchange_id}] Position sync OK account={account.id} positions={rows}"
        )

    except Exception as exc:
        logger.exception(
            f"[{account.exchange_id}] Position sync FAILED account={account.id}: {exc}"
        )
        account.sync_status = "error"
        await db.commit()
        await _finish_sync_run(
            db,
            run,
            status="error",
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
    Fetch trade history for any supported exchange.
    Incremental sync — uses last known trade_time as cursor.

    BILLING CRITICAL (plan.md Section 5-A):
      - realized_pnl = exchange API realizedPnl / realizedPnl field ONLY
      - No fee deduction. No funding rate inclusion.
    """
    run = await _start_sync_run(
        db,
        exchange_account_id=str(account.id),
        sync_type="trades",
        triggered_by=triggered_by,
    )

    creds = await get_decrypted_credentials(db, exchange_account_id=str(account.id))
    if not creds or not creds.get("api_key"):
        await _finish_sync_run(
            db, run, status="error", error_message="No credentials found"
        )
        return run

    client = create_ccxt_client(
        exchange_id=account.exchange_id,
        api_key=creds["api_key"],
        api_secret=creds["api_secret"],
        passphrase=creds.get("passphrase"),
    )
    now = datetime.now(timezone.utc)

    try:
        # Determine since timestamp
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
                since_ms = int((now.timestamp() - 90 * 86400) * 1000)

        mkt_filter = get_market_filter(account.exchange_id)
        is_futures = is_futures_exchange(account.exchange_id)
        total_rows = 0

        if is_futures:
            markets = await client.load_markets()
            settle = mkt_filter.get("settle")
            mtype = mkt_filter.get("market_type")

            futures_symbols = [
                s
                for s, m in markets.items()
                if m.get("type") == mtype
                and (settle is None or m.get("settle") == settle)
            ]

            # Limit to 50 symbols per sync to respect rate limits
            for symbol in futures_symbols[:50]:
                try:
                    trades_raw = await client.fetch_my_trades(
                        symbol, since=since_ms, limit=1000
                    )
                    if not trades_raw:
                        continue

                    for t in trades_raw:
                        info = t.get("info", {})
                        trade_id = str(t.get("id", ""))
                        realized_pnl = _get_realized_pnl(account.exchange_id, t, info)
                        trade_time = datetime.fromtimestamp(
                            t["timestamp"] / 1000, tz=timezone.utc
                        )

                        await _upsert_trade(
                            db,
                            exchange_account_id=account.id,
                            trade_id=trade_id,
                            order_id=str(info.get("orderId") or t.get("order") or ""),
                            symbol=t.get("symbol", symbol),
                            side=t.get("side", "buy"),
                            price=_dec(t.get("price", 0)),
                            qty=_dec(t.get("amount", 0)),
                            realized_pnl=realized_pnl,
                            commission=_dec((t.get("fee") or {}).get("cost", 0)),
                            commission_asset=(t.get("fee") or {}).get("currency")
                            or "USDT",
                            is_maker=t.get("takerOrMaker") == "maker",
                            trade_time=trade_time,
                            synced_at=now,
                        )
                        total_rows += 1

                except Exception as sym_exc:
                    logger.warning(
                        f"[{account.exchange_id}] Trade sync skipped {symbol}: {sym_exc}"
                    )
                    continue

        else:
            # Spot exchanges (Coinbase): fetch all trades without symbol iteration
            try:
                trades_raw = await client.fetch_my_trades(since=since_ms, limit=500)
                for t in trades_raw:
                    info = t.get("info", {})
                    trade_id = str(t.get("id", ""))

                    await _upsert_trade(
                        db,
                        exchange_account_id=account.id,
                        trade_id=trade_id,
                        order_id=str(t.get("order") or ""),
                        symbol=t.get("symbol", ""),
                        side=t.get("side", "buy"),
                        price=_dec(t.get("price", 0)),
                        qty=_dec(t.get("amount", 0)),
                        realized_pnl=Decimal("0"),  # Spot: no realized PnL concept
                        commission=_dec((t.get("fee") or {}).get("cost", 0)),
                        commission_asset=(t.get("fee") or {}).get("currency") or "USD",
                        is_maker=t.get("takerOrMaker") == "maker",
                        trade_time=datetime.fromtimestamp(
                            t["timestamp"] / 1000, tz=timezone.utc
                        ),
                        synced_at=now,
                    )
                    total_rows += 1
            except Exception as exc:
                logger.warning(
                    f"[{account.exchange_id}] Spot trade fetch failed: {exc}"
                )

        account.sync_status = "connected"
        account.last_sync_at = now
        await db.commit()
        await _finish_sync_run(db, run, status="success", rows_processed=total_rows)
        logger.info(
            f"[{account.exchange_id}] Trade sync OK account={account.id} trades={total_rows}"
        )

    except Exception as exc:
        logger.exception(
            f"[{account.exchange_id}] Trade sync FAILED account={account.id}: {exc}"
        )
        account.sync_status = "error"
        await db.commit()
        await _finish_sync_run(
            db,
            run,
            status="error",
            error_message=str(exc),
            error_code=type(exc).__name__,
        )
    finally:
        await client.close()

    return run


def _get_realized_pnl(exchange_id: str, trade: dict, info: dict) -> Decimal:
    """
    Extract realized PnL from trade data — exchange-specific field names.
    BILLING CRITICAL: use the exchange's own realizedPnl field. Never derive it.
    """
    if exchange_id == "binance_usdtm":
        # Binance: info.realizedPnl (string, can be negative)
        return _dec(info.get("realizedPnl", "0"))

    elif exchange_id == "bybit_linear":
        # Bybit: info.closedPnl or info.execPnl
        val = info.get("closedPnl") or info.get("execPnl") or "0"
        return _dec(val)

    elif exchange_id == "delta_futures":
        # Delta Exchange: info.realized_pnl or info.pnl
        val = info.get("realized_pnl") or info.get("pnl") or "0"
        return _dec(val)

    else:
        # Spot / unknown: no realized PnL concept
        return Decimal("0")


# ── Full sync ─────────────────────────────────────────────────────


async def sync_full(
    db: AsyncSession,
    *,
    account: UserExchangeAccount,
    triggered_by: str = "scheduler",
) -> list[ExchangeSyncRun]:
    """Run balances + positions + trades in sequence for any exchange."""
    runs = []
    runs.append(await sync_balances(db, account=account, triggered_by=triggered_by))
    runs.append(await sync_positions(db, account=account, triggered_by=triggered_by))
    runs.append(await sync_trades(db, account=account, triggered_by=triggered_by))
    return runs
