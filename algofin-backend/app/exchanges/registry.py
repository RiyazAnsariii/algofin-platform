# app/exchanges/registry.py
# AlgoFin v2 — Phase H: Multi-Exchange Registry
#
# Single source of truth for all supported/planned exchanges.
# Add a new exchange here; the rest of the system picks it up automatically.
#
# status values:
#   live        — fully implemented; API connect + sync works
#   coming_soon — UI visible, but connect form is disabled; API stub only
#   planned     — internal tracking; not visible in UI

from dataclasses import dataclass


@dataclass(frozen=True)
class ExchangeDefinition:
    id: str  # exchange_id stored in DB (e.g. "binance_usdtm")
    name: str  # human-readable (e.g. "Binance")
    display_name: str  # full display (e.g. "Binance USDT-M Futures")
    status: str  # "live" | "coming_soon" | "planned"
    markets: list[str]  # e.g. ["USDT-M Futures"]
    requires_passphrase: bool = False  # OKX needs a passphrase
    logo_letter: str = ""  # single letter for placeholder logo
    description: str = ""
    api_docs_url: str = ""


EXCHANGE_REGISTRY: dict[str, ExchangeDefinition] = {
    "binance_usdtm": ExchangeDefinition(
        id="binance_usdtm",
        name="Binance",
        display_name="Binance USDT-M Futures",
        status="live",
        markets=["USDT-M Futures"],
        logo_letter="B",
        description=(
            "The world's largest crypto exchange. "
            "Connect your USDT-M Futures account with read-only API keys."
        ),
        api_docs_url="https://www.binance.com/en/support/faq/how-to-create-api-keys-on-binance-360002502072",
    ),
    "bybit_linear": ExchangeDefinition(
        id="bybit_linear",
        name="Bybit",
        display_name="Bybit Linear Perpetuals",
        status="live",
        markets=["USDT Perpetuals"],
        logo_letter="Y",
        description=(
            "Bybit Linear Perpetuals. USDT-settled perpetual contracts. "
            "Connect with read-only API keys for balance, positions and trade sync."
        ),
        api_docs_url="https://www.bybit.com/en/help-center/article/How-to-create-API-Keys",
    ),
    "okx_swap": ExchangeDefinition(
        id="okx_swap",
        name="OKX",
        display_name="OKX Perpetual Swaps",
        status="live",
        markets=["USDT Perpetuals"],
        requires_passphrase=True,
        logo_letter="O",
        description=(
            "OKX Perpetual Swaps (USDT-settled). "
            "Requires API Key + Secret + Passphrase. Full balance, positions and trade sync."
        ),
        api_docs_url="https://www.okx.com/help/how-do-i-create-an-api-key",
    ),
    "coinbase_advanced": ExchangeDefinition(
        id="coinbase_advanced",
        name="Coinbase",
        display_name="Coinbase Advanced Trade",
        status="coming_soon",
        markets=["Spot"],
        logo_letter="C",
        description=(
            "Coinbase Advanced Trade (formerly Coinbase Pro). "
            "Spot trading. API integration coming soon."
        ),
        api_docs_url="https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-auth",
    ),
}

# Convenience helpers
LIVE_EXCHANGES = {k: v for k, v in EXCHANGE_REGISTRY.items() if v.status == "live"}
ALL_VISIBLE = {
    k: v for k, v in EXCHANGE_REGISTRY.items() if v.status in ("live", "coming_soon")
}
VALID_EXCHANGE_IDS = set(EXCHANGE_REGISTRY.keys())
