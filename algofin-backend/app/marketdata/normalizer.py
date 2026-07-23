# app/marketdata/normalizer.py
# AlgoFin v2 — BaseRealtimeEvent hierarchy + exchange normalizers
#
# Architecture: Exchange WS → Normalizer → Redis → FastAPI WS → Frontend
#
# Adding Bybit/OKX later: implement a new XxxNormalizer class.
# The rest of the pipeline (Redis → WS → Frontend) never changes.

from __future__ import annotations

import itertools
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

    type: str  # message discriminator: "price_update", "order_event", …
    version: int  # protocol version — increment on breaking changes
    sequence: int  # monotonically increasing per exchange; frontend drops ≤ last seen
    exchange: str  # "binance" | "bybit" | "okx"
    event_time: int  # unix ms — from the exchange
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
            "type": self.type,
            "version": self.version,
            "sequence": self.sequence,
            "exchange": self.exchange,
            "symbol": self.symbol,
            "markPrice": self.mark_price,
            "eventTime": self.event_time,
            "meta": self.meta,
        }


# ── Phase C: OrderEvent (fully implemented) ───────────────────────────────
@dataclass
class OrderEvent(BaseRealtimeEvent):
    """
    Live order status update from Binance user data stream.
    Published to Redis algofin:order_events:<user_id>.
    Relayed to the authenticated user's WebSocket connection.
    """

    order_id: str = ""  # Binance order ID (string)
    algofin_order_id: str = ""  # Our internal UUID (if placed through AlgoFin)
    client_order_id: str = ""  # algofin_<hex> if placed through us
    symbol: str = ""  # e.g. "BTCUSDT"
    side: str = ""  # "BUY" | "SELL"
    order_type: str = ""  # "MARKET" | "LIMIT" | ...
    status: str = ""  # NEW | PARTIALLY_FILLED | FILLED | CANCELLED | EXPIRED
    quantity: float = 0.0  # original order quantity
    filled_qty: float = 0.0  # cumulative filled quantity
    avg_price: float = 0.0  # average fill price (0 for unfilled)
    price: float = 0.0  # limit price (0 for MARKET)
    reduce_only: bool = False
    # user_id is NOT in the payload (user data stream is already user-scoped)
    # included here for Redis channel routing only, stripped before sending to client
    user_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        """JSON payload sent over WebSocket to the frontend."""
        return {
            "type": self.type,
            "version": self.version,
            "sequence": self.sequence,
            "exchange": self.exchange,
            "orderId": self.order_id,
            "algofinOrderId": self.algofin_order_id,
            "clientOrderId": self.client_order_id,
            "symbol": self.symbol,
            "side": self.side,
            "orderType": self.order_type,
            "status": self.status,
            "quantity": self.quantity,
            "filledQty": self.filled_qty,
            "avgPrice": self.avg_price,
            "price": self.price,
            "reduceOnly": self.reduce_only,
            "eventTime": self.event_time,
            "meta": self.meta,
        }


# ── Phase D: RiskEvent (fully implemented) ────────────────────────────────────
@dataclass
class RiskEvent(BaseRealtimeEvent):
    """
    Emitted when a risk rule triggers.
    Published to Redis algofin:risk_events:<user_id>.
    Relayed to the authenticated user's WebSocket connection.
    """

    rule_id: str = ""  # AlgoFin risk rule UUID
    rule_name: str = ""  # human-readable name
    rule_type: str = ""  # MAX_DAILY_LOSS | MAX_POSITION_SIZE | ...
    threshold: float = 0.0  # the configured limit
    current_value: float = 0.0  # the value that breached the limit
    action_taken: str = ""  # "order_rejected" | "alert_only"
    symbol: str = ""  # symbol context (empty if global)
    user_id: str = ""  # for Redis channel routing
    violation_id: str = ""  # RiskViolation DB UUID

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "version": self.version,
            "sequence": self.sequence,
            "exchange": self.exchange,
            "ruleId": self.rule_id,
            "ruleName": self.rule_name,
            "ruleType": self.rule_type,
            "threshold": self.threshold,
            "currentValue": self.current_value,
            "actionTaken": self.action_taken,
            "symbol": self.symbol,
            "violationId": self.violation_id,
            "eventTime": self.event_time,
            "meta": self.meta,
        }


# ── Phase E stub: AlertEvent ──────────────────────────────────────────────────
@dataclass
class AlertEvent(BaseRealtimeEvent):
    """Stubbed for Phase E."""

    channel: str = ""  # "telegram" | "discord" | "email"
    message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "version": self.version,
            "sequence": self.sequence,
            "exchange": self.exchange,
            "channel": self.channel,
            "message": self.message,
            "eventTime": self.event_time,
            "meta": self.meta,
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
            data = raw.get("data", raw)  # handle both combined-stream and single-stream
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


# ── Binance user data stream normalizer ──────────────────────────────────────
class BinanceUserStreamNormalizer:
    """
    Converts raw Binance user data stream events to OrderEvent.

    Binance ORDER_TRADE_UPDATE payload (USDT-M Futures):
    {
      "e": "ORDER_TRADE_UPDATE",
      "E": 1721234567891,     # event time ms
      "T": 1721234567890,     # transaction time ms
      "o": {
        "s": "BTCUSDT",       # symbol
        "c": "algofin_abc123",# client order ID
        "S": "BUY",           # side
        "o": "LIMIT",         # order type
        "f": "GTC",           # time in force
        "q": "0.01000000",    # original quantity
        "p": "60000.00",      # original price
        "ap": "0.00",         # average price
        "X": "NEW",           # order status
        "i": 123456789,       # order ID
        "l": "0.00000000",    # last filled quantity
        "z": "0.00000000",    # cumulative filled quantity
        "R": false,           # reduce only
        "T": 1721234567890,   # order trade time
      }
    }
    """

    EXCHANGE = "binance"
    # Binance status → our canonical status
    STATUS_MAP = {
        "NEW": "NEW",
        "PARTIALLY_FILLED": "PARTIALLY_FILLED",
        "FILLED": "FILLED",
        "CANCELED": "CANCELLED",
        "CANCELLED": "CANCELLED",
        "EXPIRED": "EXPIRED",
        "NEW_INSURANCE": "NEW",
        "NEW_ADL": "NEW",
    }

    @classmethod
    def normalize(
        cls,
        raw: dict[str, Any],
        user_id: str,
    ) -> OrderEvent | None:
        try:
            if raw.get("e") != "ORDER_TRADE_UPDATE":
                return None
            o = raw["o"]
            status = cls.STATUS_MAP.get(o.get("X", ""), o.get("X", ""))
            client_order_id = str(o.get("c", ""))
            # Extract AlgoFin internal order ID from client_order_id if present
            # client_order_id format: algofin_<hex16>
            algofin_order_id = ""
            # (resolved later via DB lookup in user stream manager)

            return OrderEvent(
                type="order_event",
                version=1,
                sequence=_next_seq(f"{cls.EXCHANGE}_user_{user_id}"),
                exchange=cls.EXCHANGE,
                event_time=int(raw.get("E", 0)),
                order_id=str(o.get("i", "")),
                algofin_order_id=algofin_order_id,
                client_order_id=client_order_id,
                symbol=str(o.get("s", "")),
                side=str(o.get("S", "")),
                order_type=str(o.get("o", "")),
                status=status,
                quantity=float(o.get("q", 0)),
                filled_qty=float(o.get("z", 0)),
                avg_price=float(o.get("ap", 0)),
                price=float(o.get("p", 0)),
                reduce_only=bool(o.get("R", False)),
                user_id=user_id,
            )
        except (KeyError, TypeError, ValueError):
            return None
