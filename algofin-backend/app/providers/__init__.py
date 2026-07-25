# app/providers/__init__.py
from app.config import settings
from app.providers.base import BaseEconomicCalendarProvider, NormalizedEventDTO
from app.providers.fmp_provider import FMPProvider
from app.providers.macro_calendar_provider import MacroCalendarProvider
from app.providers.tradingview_provider import TradingViewProvider


def get_economic_calendar_provider(provider_name: str | None = None) -> BaseEconomicCalendarProvider:
    """
    Factory to retrieve configured economic calendar provider instance.

    Priority:
    1. "tradingview" → TradingViewProvider (real live data, no API key required)
    2. "fmp" with key present → FMPProvider (falls back to TradingView on 401/403)
    3. "macro" or fallback → MacroCalendarProvider (structured authentic templates)
    """
    name = (provider_name or settings.economic_calendar_provider).strip().lower()
    if name == "tradingview":
        return TradingViewProvider()
    if name == "fmp" and settings.fmp_api_key:
        return FMPProvider()
    if name == "macro":
        return MacroCalendarProvider()
    # Default: TradingView gives real data with no key
    return TradingViewProvider()


__all__ = [
    "BaseEconomicCalendarProvider",
    "NormalizedEventDTO",
    "FMPProvider",
    "MacroCalendarProvider",
    "TradingViewProvider",
    "get_economic_calendar_provider",
]
