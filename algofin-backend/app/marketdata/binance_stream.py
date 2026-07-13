# app/marketdata/binance_stream.py
# AlgoFin v2 — Binance combined fstream WebSocket listener
#
# Design decisions (locked):
#   1. Single combined WS: wss://fstream.binance.com/stream?streams=a@markPrice/b@markPrice
#   2. Global Symbol Registry + debounce: new symbol → wait 2-5s → rebuild stream once
#   3. Publishes to single Redis channel: algofin:prices
#   4. Normalizes through BinanceNormalizer → MarketDataEvent → JSON → Redis

from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

import websockets
from websockets.exceptions import ConnectionClosed

from app.marketdata.normalizer import BinanceNormalizer

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
BINANCE_FSTREAM_WS  = "wss://fstream.binance.com/stream"
REDIS_CHANNEL        = "algofin:prices"
DEBOUNCE_SECONDS     = 3.0   # wait this long after last symbol change before rebuilding
RECONNECT_BASE       = 2.0   # seconds — doubles on each failure (max 60)
RECONNECT_MAX        = 60.0

# ── Global Symbol Registry ────────────────────────────────────────────────────
_symbol_registry: set[str] = set()
_registry_lock = asyncio.Lock()
_rebuild_event = asyncio.Event()   # signals that a rebuild is needed


async def register_symbols(symbols: set[str]) -> None:
    """
    Add symbols to the Global Symbol Registry.
    If any symbol is new, signal a stream rebuild (debounced externally).
    """
    async with _registry_lock:
        before = len(_symbol_registry)
        _symbol_registry.update(s.lower() for s in symbols)
        if len(_symbol_registry) != before:
            _rebuild_event.set()
            logger.info(
                f"[BinanceStream] Registry updated: {sorted(_symbol_registry)}"
            )


def _build_stream_url(symbols: set[str]) -> str:
    """Build combined stream URL from the current symbol registry."""
    streams = "/".join(f"{s.lower()}@markPrice" for s in sorted(symbols))
    return f"{BINANCE_FSTREAM_WS}?streams={streams}"


# ── Stream runner ─────────────────────────────────────────────────────────────
class BinanceStreamRunner:
    """
    Manages the single combined Binance WebSocket connection.

    Lifecycle:
        startup() → _rebuild_loop() runs in background
        When _rebuild_event fires → wait for debounce → reconnect with new URL
    """

    def __init__(self, redis_client) -> None:  # type: ignore[no-untyped-def]
        self._redis = redis_client
        self._ws: Optional[websockets.WebSocketClientProtocol] = None
        self._running = False
        self._current_symbols: set[str] = set()

    async def start(self) -> None:
        self._running = True
        asyncio.create_task(self._rebuild_loop())
        logger.info("[BinanceStream] Started.")

    async def stop(self) -> None:
        self._running = False
        if self._ws:
            await self._ws.close()

    # ── Rebuild loop ──────────────────────────────────────────────────────────
    async def _rebuild_loop(self) -> None:
        """
        Waits for _rebuild_event, debounces, then reconnects.

        Global Symbol Registry flow:
            New symbol added → _rebuild_event.set()
                             → debounce 3s (absorbs bursts)
                             → rebuild combined stream once
        """
        while self._running:
            await _rebuild_event.wait()
            _rebuild_event.clear()

            # Debounce: if more symbols arrive within DEBOUNCE_SECONDS, reset the wait
            await asyncio.sleep(DEBOUNCE_SECONDS)
            if _rebuild_event.is_set():
                # More symbols arrived during debounce — loop again
                continue

            async with _registry_lock:
                symbols = set(_symbol_registry)

            if not symbols or symbols == self._current_symbols:
                continue

            logger.info(f"[BinanceStream] Rebuilding stream for: {sorted(symbols)}")
            self._current_symbols = symbols

            # Cancel existing stream and start a new one
            if self._ws:
                try:
                    await self._ws.close()
                except Exception:
                    pass

            asyncio.create_task(self._connect_and_stream(symbols))

    # ── Connection + stream ───────────────────────────────────────────────────
    async def _connect_and_stream(self, symbols: set[str]) -> None:
        url = _build_stream_url(symbols)
        backoff = RECONNECT_BASE

        while self._running:
            try:
                logger.info(f"[BinanceStream] Connecting to: {url}")
                async with websockets.connect(
                    url,
                    ping_interval=None,   # Binance handles keepalive
                    open_timeout=10,
                    close_timeout=5,
                ) as ws:
                    self._ws = ws
                    backoff = RECONNECT_BASE   # reset on successful connect
                    logger.info("[BinanceStream] Connected.")

                    async for raw_message in ws:
                        # Check if symbol registry changed → let rebuild_loop handle it
                        if _rebuild_event.is_set():
                            logger.info(
                                "[BinanceStream] Registry changed — closing to rebuild."
                            )
                            break

                        try:
                            data = json.loads(raw_message)
                        except json.JSONDecodeError:
                            continue

                        event = BinanceNormalizer.normalize(data)
                        if event is None:
                            continue

                        payload = json.dumps(event.to_dict())
                        await self._redis.publish(REDIS_CHANNEL, payload)

            except ConnectionClosed as exc:
                logger.warning(f"[BinanceStream] Connection closed: {exc}")
            except Exception as exc:
                logger.exception(f"[BinanceStream] Error: {exc}")

            if not self._running:
                break

            logger.info(f"[BinanceStream] Reconnecting in {backoff:.0f}s …")
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, RECONNECT_MAX)


# ── Singleton ─────────────────────────────────────────────────────────────────
_runner: Optional[BinanceStreamRunner] = None


def get_runner() -> Optional[BinanceStreamRunner]:
    return _runner


async def start_binance_stream(redis_client) -> None:  # type: ignore[no-untyped-def]
    """Call from FastAPI startup event."""
    global _runner
    _runner = BinanceStreamRunner(redis_client)
    await _runner.start()


async def stop_binance_stream() -> None:
    """Call from FastAPI shutdown event."""
    if _runner:
        await _runner.stop()
