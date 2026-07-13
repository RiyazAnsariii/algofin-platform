# app/marketdata/ws_router.py
# AlgoFin v2 — FastAPI WebSocket endpoint for real-time market data
#
# Protocol decisions (locked):
#   - First-message auth: client sends {type:"auth", token:...} within 5s
#   - Server-only heartbeat: server sends ping every 30s, client responds pong
#   - Dynamic subscriptions: {type:"subscribe", symbols:[...]} at any time
#   - algofin:prices single channel, filtered by user's subscribed symbols
#   - algofin:order_events:<user_id> per-user channel, all events relayed
#   - All messages: {type, version, ...}

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.common.security import decode_access_token
from app.marketdata.binance_stream import REDIS_CHANNEL, register_symbols

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/marketdata", tags=["Market Data"])

# ── Protocol constants ────────────────────────────────────────────────────────
PROTOCOL_VERSION  = 1
AUTH_TIMEOUT_SEC  = 5.0   # close with 4001 if auth not received in time
PING_INTERVAL_SEC = 30.0  # server pings client every 30s
PONG_TIMEOUT_SEC  = 10.0  # client must pong within 10s or server closes


def _msg(**kwargs: Any) -> str:
    return json.dumps({"version": PROTOCOL_VERSION, **kwargs})


# ── WebSocket handler ─────────────────────────────────────────────────────────
@router.websocket("/ws")
async def marketdata_ws(ws: WebSocket) -> None:
    """
    Real-time market data WebSocket.

    Connection lifecycle:
        1. Client connects
        2. Server sends {type:"connected"}
        3. Client sends {type:"auth", token:"<access_token>"} within 5s
        4. Server validates token → auth_ok or closes 4001
        5. Client sends {type:"subscribe", symbols:[...]}
        6. Server streams {type:"price_update", ...} for subscribed symbols
        7. Server sends {type:"ping"} every 30s; client responds {type:"pong"}
        8. No pong within 10s → server closes connection
    """
    await ws.accept()

    # ── Step 1: Announce connection ───────────────────────────────────────────
    await ws.send_text(_msg(type="connected"))

    # ── Step 2: Wait for auth (5s timeout) ───────────────────────────────────
    user_id: str | None = None
    try:
        raw = await asyncio.wait_for(ws.receive_text(), timeout=AUTH_TIMEOUT_SEC)
        msg = json.loads(raw)
        if msg.get("type") != "auth" or not msg.get("token"):
            await ws.close(code=4001, reason="auth_required")
            return
        payload = decode_access_token(msg["token"])
        if payload is None:
            await ws.send_text(_msg(type="auth_error", reason="invalid token"))
            await ws.close(code=4001, reason="invalid token")
            return
        user_id = str(payload["sub"])
        await ws.send_text(_msg(type="auth_ok", user_id=user_id))
        logger.info(f"[MarketDataWS] User {user_id} authenticated.")
    except asyncio.TimeoutError:
        await ws.close(code=4001, reason="auth_timeout")
        return
    except (json.JSONDecodeError, KeyError):
        await ws.close(code=4001, reason="malformed_auth")
        return

    # ── Session state ────────────────────────────────────────────
    subscribed_symbols: set[str] = set()   # user's current symbol filter

    # ── Redis pub/sub ────────────────────────────────────────────
    # Two channels:
    #  1. algofin:prices           — public mark prices, filtered by subscribed symbols
    #  2. algofin:order_events:<user_id> — private order updates, all relayed
    from app.database import get_redis_client  # type: ignore[import]
    from app.marketdata.binance_user_stream import order_event_channel
    from app.risk.engine import risk_event_channel  # v2 Phase D

    redis  = await get_redis_client()
    pubsub = redis.pubsub()
    await pubsub.subscribe(
        REDIS_CHANNEL,
        order_event_channel(user_id),
        risk_event_channel(user_id),    # v2 Phase D
    )

    # ── Async tasks ───────────────────────────────────────────────────────────
    async def stream_prices() -> None:
        """Relay Redis pub/sub messages to the client.
        - price_update: filtered by subscribed symbols
        - order_event:  always relayed (already user-scoped channel)
        """
        async for message in pubsub.listen():
            if ws.client_state != WebSocketState.CONNECTED:
                break
            if message["type"] != "message":
                continue
            try:
                data = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                continue

            msg_type = data.get("type")
            if msg_type == "price_update":
                # Filter: only send symbols the user subscribed to
                if data.get("symbol") in subscribed_symbols:
                    await ws.send_text(json.dumps(data))
            elif msg_type in ("order_event", "risk_event"):
                # Always relay — channels are already user-scoped
                await ws.send_text(json.dumps(data))

    async def heartbeat() -> None:
        """
        Server-initiated heartbeat.
        Server sends ping every 30s. Client must respond pong within 10s.
        """
        while ws.client_state == WebSocketState.CONNECTED:
            await asyncio.sleep(PING_INTERVAL_SEC)
            if ws.client_state != WebSocketState.CONNECTED:
                break
            import time
            await ws.send_text(
                _msg(type="ping", timestamp=int(time.time() * 1000))
            )

    async def receive_messages() -> None:
        """Handle incoming client messages (subscribe / unsubscribe / pong)."""
        nonlocal subscribed_symbols
        while True:
            try:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=PING_INTERVAL_SEC + PONG_TIMEOUT_SEC)
            except asyncio.TimeoutError:
                # Client has not sent pong in time — close connection
                logger.warning(f"[MarketDataWS] User {user_id} pong timeout.")
                await ws.close(code=4008, reason="pong_timeout")
                return
            except WebSocketDisconnect:
                return

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "subscribe":
                new_symbols = {s.upper() for s in msg.get("symbols", [])}
                subscribed_symbols.update(new_symbols)
                # Register with the Global Symbol Registry → may trigger stream rebuild
                await register_symbols(new_symbols)
                await ws.send_text(_msg(type="subscribed", symbols=sorted(subscribed_symbols)))
                logger.info(f"[MarketDataWS] User {user_id} subscribed: {new_symbols}")

            elif msg_type == "unsubscribe":
                remove = {s.upper() for s in msg.get("symbols", [])}
                subscribed_symbols -= remove
                await ws.send_text(_msg(type="unsubscribed", symbols=sorted(subscribed_symbols)))

            elif msg_type == "pong":
                # Heartbeat acknowledged — no action needed, timer resets naturally
                pass

            else:
                await ws.send_text(_msg(
                    type="error",
                    code=4000,
                    reason=f"unknown message type: {msg_type}",
                ))

    # ── Run all tasks concurrently ──────────────────────────────────────────
    try:
        await asyncio.gather(
            stream_prices(),
            heartbeat(),
            receive_messages(),
            return_exceptions=True,
        )
    except Exception as exc:
        logger.exception(f"[MarketDataWS] Unhandled error for user {user_id}: {exc}")
    finally:
        try:
            from app.marketdata.binance_user_stream import order_event_channel as _oec
            from app.risk.engine import risk_event_channel as _rec
            await pubsub.unsubscribe(REDIS_CHANNEL, _oec(user_id), _rec(user_id))
            await pubsub.close()
        except Exception:
            pass
        logger.info(f"[MarketDataWS] User {user_id} disconnected.")

