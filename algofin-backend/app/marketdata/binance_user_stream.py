# app/marketdata/binance_user_stream.py
# AlgoFin v2 — Phase C: Binance User Data Stream (per exchange account)
#
# Binance User Data Stream lifecycle:
#   1. POST /fapi/v1/listenKey → get listenKey (valid 60 min)
#   2. Connect wss://fstream.binance.com/ws/<listenKey>
#   3. PUT /fapi/v1/listenKey every 30 min to extend
#   4. On ORDER_TRADE_UPDATE → normalize → update DB → publish to Redis
#
# Redis channel: algofin:order_events:<user_id>
# One manager instance per exchange account.

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

import ccxt.async_support as ccxt
import websockets
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from websockets.exceptions import ConnectionClosed

from app.marketdata.normalizer import BinanceUserStreamNormalizer, OrderEvent

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
BINANCE_USER_STREAM_WS   = "wss://fstream.binance.com/ws"
LISTEN_KEY_REFRESH_SEC   = 30 * 60      # refresh every 30 min (key expires in 60)
RECONNECT_BASE           = 2.0
RECONNECT_MAX            = 60.0
ORDER_EVENT_CHANNEL      = "algofin:order_events:{user_id}"


def order_event_channel(user_id: str) -> str:
    return f"algofin:order_events:{user_id}"


# ── Per-account user stream manager ──────────────────────────────────────────
class BinanceUserStreamManager:
    """
    Manages the Binance user data stream for ONE exchange account.

    Responsibilities:
    - Obtain and periodically refresh the listenKey
    - Maintain a WebSocket connection to the user data stream
    - Normalize ORDER_TRADE_UPDATE events → OrderEvent
    - Update the Order record in the DB (status, filled_qty, avg_price)
    - Publish the event to Redis algofin:order_events:<user_id>
    """

    def __init__(
        self,
        *,
        account_id: str,
        user_id: str,
        api_key: str,
        api_secret: str,
        redis_client,             # type: ignore[no-untyped-def]
        db_session_factory,       # type: ignore[no-untyped-def]
    ) -> None:
        self.account_id         = account_id
        self.user_id            = user_id
        self._api_key           = api_key
        self._api_secret        = api_secret
        self._redis             = redis_client
        self._db_factory        = db_session_factory   # async session maker
        self._running           = False
        self._listen_key: str | None = None
        self._ws: Optional[websockets.WebSocketClientProtocol] = None

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    async def start(self) -> None:
        self._running = True
        asyncio.create_task(self._run())
        logger.info(f"[UserStream] Account {self.account_id} started.")

    async def stop(self) -> None:
        self._running = False
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass

    # ── Main loop ─────────────────────────────────────────────────────────────
    async def _run(self) -> None:
        backoff = RECONNECT_BASE
        while self._running:
            try:
                # Step 1: Get listen key
                self._listen_key = await self._get_listen_key()
                if not self._listen_key:
                    logger.warning(f"[UserStream] Could not get listenKey for {self.account_id}")
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2, RECONNECT_MAX)
                    continue

                url = f"{BINANCE_USER_STREAM_WS}/{self._listen_key}"
                logger.info(f"[UserStream] Connecting {self.account_id} …")

                # Step 2: Connect and stream
                async with websockets.connect(
                    url,
                    ping_interval=None,
                    open_timeout=10,
                    close_timeout=5,
                ) as ws:
                    self._ws = ws
                    backoff = RECONNECT_BASE   # reset on success

                    # Step 3: Schedule listen key refresh
                    refresh_task = asyncio.create_task(self._refresh_listen_key_loop())

                    try:
                        async for raw_message in ws:
                            if not self._running:
                                break
                            try:
                                data = json.loads(raw_message)
                            except json.JSONDecodeError:
                                continue
                            await self._handle_event(data)
                    finally:
                        refresh_task.cancel()

            except ConnectionClosed as exc:
                logger.warning(f"[UserStream] {self.account_id} closed: {exc}")
            except Exception as exc:
                logger.exception(f"[UserStream] {self.account_id} error: {exc}")

            if not self._running:
                break

            logger.info(f"[UserStream] {self.account_id} reconnecting in {backoff:.0f}s …")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, RECONNECT_MAX)

    # ── Listen key management ─────────────────────────────────────────────────
    async def _get_listen_key(self) -> str | None:
        client = self._make_client()
        try:
            await client.load_markets()
            response = await client.fapiPrivatePostListenKey()
            return str(response.get("listenKey", ""))
        except Exception as exc:
            logger.warning(f"[UserStream] listenKey GET failed: {exc}")
            return None
        finally:
            await client.close()

    async def _refresh_listen_key_loop(self) -> None:
        """Refresh the listenKey every 30 minutes to prevent expiry."""
        while self._running:
            await asyncio.sleep(LISTEN_KEY_REFRESH_SEC)
            if not self._listen_key:
                continue
            client = self._make_client()
            try:
                await client.fapiPrivatePutListenKey({"listenKey": self._listen_key})
                logger.debug(f"[UserStream] listenKey refreshed for {self.account_id}")
            except Exception as exc:
                logger.warning(f"[UserStream] listenKey refresh failed: {exc}")
            finally:
                await client.close()

    # ── Event handler ─────────────────────────────────────────────────────────
    async def _handle_event(self, data: dict) -> None:
        """Process a raw Binance user data stream event."""
        event_type = data.get("e")

        if event_type == "ORDER_TRADE_UPDATE":
            order_event = BinanceUserStreamNormalizer.normalize(data, self.user_id)
            if order_event is None:
                return

            # Update Order record in DB
            await self._update_order_in_db(order_event)

            # Publish to Redis (per-user channel for security)
            channel = order_event_channel(self.user_id)
            payload = json.dumps(order_event.to_dict())
            await self._redis.publish(channel, payload)

        elif event_type == "ACCOUNT_UPDATE":
            # Future: Portfolio event (Phase B+ enhancement)
            pass

        elif event_type == "listenKeyExpired":
            logger.warning(f"[UserStream] listenKey expired for {self.account_id} — reconnecting")
            if self._ws:
                await self._ws.close()

    # ── DB update ─────────────────────────────────────────────────────────────
    async def _update_order_in_db(self, event: OrderEvent) -> None:
        """
        Update the Order record status from the live event.
        Only updates orders placed through AlgoFin (matching client_order_id prefix).
        """
        if not event.client_order_id.startswith("algofin_"):
            return   # Skip orders not placed through AlgoFin

        try:
            from app.models.order import Order  # avoid circular import
            async with self._db_factory() as session:
                result = await session.execute(
                    select(Order).where(
                        Order.client_order_id == event.client_order_id,
                        Order.exchange_account_id == self.account_id,
                    )
                )
                order = result.scalar_one_or_none()
                if order is None:
                    return

                # Inject the AlgoFin order ID back into the event for the frontend
                event.algofin_order_id = str(order.id)

                # Update status
                order.status = event.status
                order.filled_quantity = Decimal(str(event.filled_qty))
                if event.avg_price > 0:
                    order.avg_fill_price = Decimal(str(event.avg_price))

                now = datetime.now(timezone.utc)
                if event.status == "FILLED":
                    order.filled_at = now
                elif event.status == "CANCELLED":
                    order.cancelled_at = now

                await session.commit()
                logger.info(
                    f"[UserStream] Order {order.id} updated to {event.status}"
                )
        except Exception as exc:
            logger.exception(f"[UserStream] DB update failed: {exc}")

    # ── CCXT factory ──────────────────────────────────────────────────────────
    def _make_client(self) -> ccxt.binanceusdm:
        return ccxt.binanceusdm({
            "apiKey":  self._api_key,
            "secret":  self._api_secret,
            "options": {"defaultType": "future"},
            "enableRateLimit": True,
        })


# ── Global registry of running managers ──────────────────────────────────────
_managers: dict[str, BinanceUserStreamManager] = {}


async def start_user_stream(
    *,
    account_id: str,
    user_id: str,
    api_key: str,
    api_secret: str,
    redis_client,
    db_session_factory,
) -> None:
    """Start a user data stream for one exchange account (idempotent)."""
    if account_id in _managers:
        return
    manager = BinanceUserStreamManager(
        account_id=account_id,
        user_id=user_id,
        api_key=api_key,
        api_secret=api_secret,
        redis_client=redis_client,
        db_session_factory=db_session_factory,
    )
    _managers[account_id] = manager
    await manager.start()


async def stop_all_user_streams() -> None:
    """Stop all user data stream managers. Called on app shutdown."""
    for manager in list(_managers.values()):
        await manager.stop()
    _managers.clear()


async def start_all_user_streams(redis_client, db_session_factory) -> None:
    """
    On startup: load all active exchange accounts and start their user streams.
    Also called when a new exchange account is connected.
    """
    from sqlalchemy import select
    from app.exchanges.service import get_decrypted_credentials
    from app.models.exchange import UserExchangeAccount

    logger.info("[UserStream] Loading active exchange accounts …")
    try:
        async with db_session_factory() as session:
            result = await session.execute(
                select(UserExchangeAccount).where(
                    UserExchangeAccount.is_active == True  # noqa: E712
                )
            )
            accounts = list(result.scalars().all())

        for account in accounts:
            try:
                creds = await get_decrypted_credentials(
                    # Need a fresh session for each credential fetch
                    None,  # type: ignore
                    exchange_account_id=str(account.id),
                )
                # get_decrypted_credentials requires a db session — use factory
                async with db_session_factory() as session:
                    creds = await get_decrypted_credentials(
                        session, exchange_account_id=str(account.id)
                    )
                if not creds.get("api_key"):
                    continue
                await start_user_stream(
                    account_id=str(account.id),
                    user_id=str(account.user_id),
                    api_key=creds["api_key"],
                    api_secret=creds["api_secret"],
                    redis_client=redis_client,
                    db_session_factory=db_session_factory,
                )
            except Exception as exc:
                logger.warning(f"[UserStream] Could not start stream for {account.id}: {exc}")

        logger.info(f"[UserStream] Started {len(_managers)} user stream(s).")
    except Exception as exc:
        logger.exception(f"[UserStream] Startup failed: {exc}")
