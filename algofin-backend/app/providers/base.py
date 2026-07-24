# app/providers/base.py
# AlgoFin v1 — Economic calendar abstract provider interface

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional, Tuple


@dataclass
class NormalizedEventDTO:
    """
    Provider-agnostic normalized representation of an economic calendar event.
    """

    provider_event_id: Optional[str]
    event_hash: str
    title: str
    country: str
    currency: str
    impact: str  # "High" | "Medium" | "Low"
    event_time_utc: datetime
    actual: Optional[str]
    forecast: Optional[str]
    previous: Optional[str]
    source: str
    raw_payload: Optional[dict]


class BaseEconomicCalendarProvider(ABC):
    """
    Abstract base class for economic calendar data providers.
    Supports pluggable providers (FMP, TradingEconomics, ForexFactory, etc.).
    """

    provider_name: str = "base"
    provider_version: str = "v1"

    @abstractmethod
    async def fetch_events(
        self, from_date: date, to_date: date
    ) -> Tuple[List[NormalizedEventDTO], int]:
        """
        Fetch economic events for the specified date range.
        Returns a tuple of (normalized_events, http_status_code).
        Raises Exception on unrecoverable failure.
        """
        pass
