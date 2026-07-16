# app/exchanges/ccxt_adapter.py
# AlgoFin v2 — Phase J: Multi-Exchange CCXT Adapter
#
# Factory that returns the correct CCXT async client for any supported exchange.
# All exchanges share the same sync_engine interface — only the client differs.
#
# Supported exchanges:
#   binance_usdtm   → ccxt.binanceusdm   (USDT-M Futures)
#   bybit_linear    → ccxt.bybit         (Linear Perpetuals)
#   okx_swap        → ccxt.okx           (Perpetual Swaps, needs passphrase)
#   coinbase_advanced → ccxt.coinbase    (Spot — futures N/A)

import logging
import ccxt.async_support as ccxt

logger = logging.getLogger(__name__)


# ── Market type helpers ───────────────────────────────────────────

EXCHANGE_OPTIONS: dict[str, dict] = {
    "binance_usdtm": {
        "ccxt_class": "binanceusdm",
        "options":    {"defaultType": "future"},
        "market_type": "future",
        "settle":      "USDT",
    },
    "bybit_linear": {
        "ccxt_class": "bybit",
        "options":    {"defaultType": "linear"},
        "market_type": "swap",
        "settle":      "USDT",
    },
    "okx_swap": {
        "ccxt_class": "okx",
        "options":    {"defaultType": "swap"},
        "market_type": "swap",
        "settle":      "USDT",
    },
    "coinbase_advanced": {
        "ccxt_class": "coinbase",
        "options":    {},
        "market_type": "spot",
        "settle":      None,
    },
}


def create_ccxt_client(
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: str | None = None,
) -> ccxt.Exchange:
    """
    Create and return an authenticated async CCXT client for the given exchange_id.
    Raises ValueError if the exchange_id is not supported.
    """
    cfg = EXCHANGE_OPTIONS.get(exchange_id)
    if cfg is None:
        raise ValueError(f"Unsupported exchange: {exchange_id!r}")

    cls_name = cfg["ccxt_class"]
    cls = getattr(ccxt, cls_name, None)
    if cls is None:
        raise ValueError(f"CCXT class not found: {cls_name!r}")

    init_kwargs: dict = {
        "apiKey":          api_key,
        "secret":          api_secret,
        "enableRateLimit": True,
        "options":         cfg["options"],
    }

    if passphrase:
        init_kwargs["password"] = passphrase  # OKX uses 'password' for passphrase

    client = cls(init_kwargs)
    logger.debug(f"Created CCXT client: {cls_name} for exchange_id={exchange_id}")
    return client


def get_market_filter(exchange_id: str) -> dict:
    """Return the market type and settle currency used to filter symbols for this exchange."""
    cfg = EXCHANGE_OPTIONS.get(exchange_id, {})
    return {
        "market_type": cfg.get("market_type", "spot"),
        "settle":      cfg.get("settle"),
    }


def is_futures_exchange(exchange_id: str) -> bool:
    """Return True if this exchange trades futures/perpetuals (not spot)."""
    return EXCHANGE_OPTIONS.get(exchange_id, {}).get("market_type") in ("future", "swap")
