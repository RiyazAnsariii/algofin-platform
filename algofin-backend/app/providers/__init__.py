# app/providers/__init__.py
from app.config import settings
from app.providers.base import BaseEconomicCalendarProvider, NormalizedEventDTO
from app.providers.fmp_provider import FMPProvider
from app.providers.macro_calendar_provider import MacroCalendarProvider


def get_economic_calendar_provider(provider_name: str | None = None) -> BaseEconomicCalendarProvider:
    """
    Factory to retrieve configured economic calendar provider instance.
    Defaults to MacroCalendarProvider if FMP key is not provided or if specified.
    """
    name = (provider_name or settings.economic_calendar_provider).strip().lower()
    if name == "fmp" and settings.fmp_api_key:
        return FMPProvider()
    elif name == "macro" or name == "fmp":
        return MacroCalendarProvider()
    else:
        return MacroCalendarProvider()


__all__ = [
    "BaseEconomicCalendarProvider",
    "NormalizedEventDTO",
    "FMPProvider",
    "MacroCalendarProvider",
    "get_economic_calendar_provider",
]
