# app/influencer/quantity.py
# Phase INF: Quantity normalization utility
#
# Standalone — no FastAPI or DB dependencies.
# Used by the fan-out worker to compute and validate order quantity
# before placing (LIVE) or logging (DRY_RUN) orders.
#
# Pipeline for every ENTER_LONG / ENTER_SHORT:
#   1. raw_qty     = capital_usdt / mark_price
#   2. filters     = get_symbol_filters(symbol, redis)   ← cached 1h
#   3. qty         = round_down(raw_qty, stepSize)
#   4. Validate:   qty >= minQty
#   5. Validate:   qty * mark_price >= minNotional
#   6. Return normalized qty  (or raise QuantityError with reason)
#
# EXIT signals use the same formula during DRY_RUN phase (placeholder).
# In INF+1 (LIVE), EXIT quantity comes from the open position / Pine payload.

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from decimal import ROUND_DOWN, Decimal

logger = logging.getLogger(__name__)

# Redis cache key prefix + TTL
_FILTER_KEY_PREFIX = "algofin:filters:"
_FILTER_TTL_SECONDS = 3600  # 1 hour


class QuantityError(Exception):
    """Raised when computed quantity fails a Binance exchange filter."""

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


@dataclass
class SymbolFilters:
    """Parsed LOT_SIZE and MIN_NOTIONAL filters from Binance exchangeInfo."""

    step_size: Decimal
    min_qty: Decimal
    max_qty: Decimal
    min_notional: Decimal


# ── Public API ────────────────────────────────────────────────────────────────


async def get_symbol_filters(symbol: str, redis) -> SymbolFilters:
    """
    Fetch Binance USDT-M Futures exchange filters for a symbol.

    Results are cached in Redis for 1 hour (key: algofin:filters:{symbol}).
    On cache miss: calls Binance public REST API via httpx (no auth needed).

    Args:
        symbol: e.g. "BTCUSDT"
        redis:  redis.asyncio.Redis client

    Returns:
        SymbolFilters with stepSize, minQty, maxQty, minNotional
    """
    key = f"{_FILTER_KEY_PREFIX}{symbol.upper()}"

    # ── Cache hit ─────────────────────────────────────────────────────────────
    cached = await redis.get(key)
    if cached:
        data = json.loads(cached)
        return SymbolFilters(
            step_size=Decimal(data["step_size"]),
            min_qty=Decimal(data["min_qty"]),
            max_qty=Decimal(data["max_qty"]),
            min_notional=Decimal(data["min_notional"]),
        )

    # ── Cache miss: fetch from Binance ────────────────────────────────────────
    filters = await _fetch_from_binance(symbol)
    payload = json.dumps({
        "step_size": str(filters.step_size),
        "min_qty": str(filters.min_qty),
        "max_qty": str(filters.max_qty),
        "min_notional": str(filters.min_notional),
    })
    await redis.setex(key, _FILTER_TTL_SECONDS, payload)
    logger.info(f"[Quantity] Cached filters for {symbol}: {filters}")
    return filters


def normalize_quantity(
    raw_qty: Decimal,
    mark_price: Decimal,
    filters: SymbolFilters,
) -> Decimal:
    """
    Normalize raw quantity against Binance LOT_SIZE and MIN_NOTIONAL filters.

    Steps:
        1. Round DOWN to stepSize precision
        2. Raise QuantityError if qty < minQty
        3. Raise QuantityError if qty * mark_price < minNotional
        4. Return normalized qty

    Args:
        raw_qty:    capital_usdt / mark_price  (unrounded Decimal)
        mark_price: live mark price for notional check
        filters:    SymbolFilters from get_symbol_filters()

    Returns:
        Normalized Decimal quantity ready for order placement.

    Raises:
        QuantityError: with .reason set to "QUANTITY_TOO_SMALL" or "BELOW_MIN_NOTIONAL"
    """
    qty = _round_down(raw_qty, filters.step_size)

    if qty < filters.min_qty:
        raise QuantityError(
            f"QUANTITY_TOO_SMALL: qty={qty} < minQty={filters.min_qty} "
            f"(capital too small for this symbol at current price)"
        )

    notional = qty * mark_price
    if notional < filters.min_notional:
        raise QuantityError(
            f"BELOW_MIN_NOTIONAL: notional={notional:.2f} < "
            f"minNotional={filters.min_notional} "
            f"(qty={qty} × price={mark_price})"
        )

    return qty


# ── Internal helpers ──────────────────────────────────────────────────────────


def _round_down(value: Decimal, step: Decimal) -> Decimal:
    """Round value DOWN to the nearest multiple of step."""
    if step == 0:
        return value
    return (value // step) * step


async def _fetch_from_binance(symbol: str) -> SymbolFilters:
    """
    Fetch exchange info for a single symbol from Binance USDT-M Futures.
    Public endpoint — no auth required.
    """
    import httpx

    url = "https://fapi.binance.com/fapi/v1/exchangeInfo"
    params = {"symbol": symbol.upper()}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error(f"[Quantity] Failed to fetch Binance exchangeInfo for {symbol}: {exc}")
        # Fallback safe defaults — worker will still write DRY_RUN_OK with warning
        logger.warning(f"[Quantity] Using fallback defaults for {symbol}")
        return _fallback_filters()

    symbols = data.get("symbols", [])
    if not symbols:
        logger.warning(f"[Quantity] No symbol data for {symbol}, using fallback")
        return _fallback_filters()

    sym_data = symbols[0]
    filters = sym_data.get("filters", [])

    step_size = Decimal("0.001")
    min_qty = Decimal("0.001")
    max_qty = Decimal("1000")
    min_notional = Decimal("5")

    for f in filters:
        ft = f.get("filterType")
        if ft == "LOT_SIZE":
            step_size = Decimal(f.get("stepSize", "0.001"))
            min_qty = Decimal(f.get("minQty", "0.001"))
            max_qty = Decimal(f.get("maxQty", "1000"))
        elif ft == "MIN_NOTIONAL":
            min_notional = Decimal(f.get("notional", f.get("minNotional", "5")))

    return SymbolFilters(
        step_size=step_size,
        min_qty=min_qty,
        max_qty=max_qty,
        min_notional=min_notional,
    )


def _fallback_filters() -> SymbolFilters:
    """
    Conservative fallback when Binance is unreachable.
    stepSize=0.001, minQty=0.001, minNotional=5 — safe for BTC/ETH.
    """
    return SymbolFilters(
        step_size=Decimal("0.001"),
        min_qty=Decimal("0.001"),
        max_qty=Decimal("9000"),
        min_notional=Decimal("5"),
    )
