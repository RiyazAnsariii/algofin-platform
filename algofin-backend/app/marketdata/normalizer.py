# app/marketdata/normalizer.py
# AlgoFin v2 — BaseRealtimeEvent hierarchy + exchange normalizers
#
# Architecture: Exchange WS → Normalizer → Redis → FastAPI WS → Frontend
#
# Adding Bybit/OKX later: implement a new XxxNormalizer class.
# The rest of the pipeline (Redis → WS → Frontend) never changes.

from __future__ import annotations

import itertools
import time
from dataclasses import dataclass, field
from typing import Any


# ── Sequence counter ──────────────────────────────────────────────────────────
# Per-exchange monotonic counter so the frontend can drop stale/dup events.
_seq_counters: dict[str, itertools.count] = {}  # type: ignore[type-arg]


def _next_seq(exchange: str) -> int:
    if exchange not in _seq_counters:
        _seq_counters[exchange] = itertools.count(1)
    return next(_seq_counters[exchange])


# ── Base event ────────────────────────────────────────────────────────────────
@dataclass
class BaseRealtimeEvent:
    """
    Root of the real-time event hierarchy.
    Every event type that flows through the WebSocket transport
    must inherit from this class.

    Hierarchy:
        BaseRealtimeEvent
        ├── MarketDataEvent   (Phase A — built now)
        ├── OrderEvent        (Phase C — stubbed, fleshed out later)
        ├── PortfolioEvent    (Future)
        ├── RiskEvent         (Phase D)
        └── AlertEvent        (Phase E)
    """
    type: str           # message discriminator: "price_update", "order_event", …
    version: int        # protocol version — increment on breaking changes
    sequence: int       # monotonically increasing per exchange; frontend drops ≤ last seen
    exchange: str       # "binance" | "bybit" | "okx"
    event_time: int     # unix ms — from the exchange
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        raise NotImplementedError


# ── Phase A: MarketDataEvent ──────────────────────────────────────────────────
@dataclass
class MarketDataEvent(BaseRealtimeEvent):
    """Live mark price update — display only in the frontend."""
    symbol: str = ""
    mark_price: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "type":       self.type,
            "version":    self.version,
            "sequence":   self.sequence,
            "exchange":   self.exchange,
            "symbol":     self.symbol,
            "markPrice":  self.mark_price,
            "eventTime":  self.event_time,
            "meta":       self.meta,
        }


# ── Phase C stub: OrderEvent ──────────────────────────────────────────────────
@dataclass
class OrderEvent(BaseRealtimeEvent):
    """
    Live order status update.
    Stubbed here so the WS transport works for all event types from Phase A.
    Full implementation in Phase C.
    """
    order_id:   str   = ""
    symbol:     str   = ""
    status:     str   = ""   # NEW | PARTIALLY_FILLED | FILLED | CANCELLED | EXPIRED
    filled_qty: float = 0.0
    avg_price:  float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "type":      self.type,
            "version":   self.version,
            "sequence":  self.sequence,
            "exchange":  self.exchange,
            "orderId":   self.order_id,
            "symbol":    self.symbol,
            "status":    self.status,
            "filledQty": self.filled_qty,
            "avgPrice":  self.avg_price,
            "eventTime": self.event_time,
            "meta":      self.meta,
        }


# ── Phase D stub: RiskEvent ───────────────────────────────────────────────────
@dataclass
class RiskEvent(BaseRealtimeEvent):
    """Stubbed for Phase D."""
    rule_id:   str = ""
    triggered: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "type":      self.type,
            "version":   self.version,
            "sequence":  self.sequence,
            "exchange":  self.exchange,
            "ruleId":    self.rule_id,
            "triggered": self.triggered,
            "eventTime": self.event_time,
            "meta":      self.meta,
        }


# ── Phase E stub: AlertEvent ──────────────────────────────────────────────────
@dataclass
class AlertEvent(BaseRealtimeEvent):
    """Stubbed for Phase E."""
    channel:  str = ""   # "telegram" | "discord" | "email"
    message:  str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "type":      self.type,
            "version":   self.version,
            "sequence":  self.sequence,
            "exchange":  self.exchange,
            "channel":   self.channel,
            "message":   self.message,
            "eventTime": self.event_time,
            "meta":      self.meta,
        }


# ── Binance normalizer ────────────────────────────────────────────────────────
class BinanceNormalizer:
    """
    Converts raw Binance fstream `markPriceUpdate` event to MarketDataEvent.

    Binance combined stream payload example:
    {
      "stream": "btcusdt@markPrice",
      "data": {
        "e": "markPriceUpdate",
        "E": 1721234567891,   # event time ms
        "s": "BTCUSDT",
        "p": "108345.20000000"
      }
    }
    """

    EXCHANGE = "binance"

    @classmethod
    def normalize(cls, raw: dict[str, Any]) -> MarketDataEvent | None:
        try:
            data = raw.get("data", raw)   # handle both combined-stream and single-stream
            if data.get("e") != "markPriceUpdate":
                return None
            return MarketDataEvent(
                type="price_update",
                version=1,
                sequence=_next_seq(cls.EXCHANGE),
                exchange=cls.EXCHANGE,
                event_time=int(data["E"]),
                symbol=str(data["s"]),
                mark_price=float(data["p"]),
            )
        except (KeyError, TypeError, ValueError):
            return None
