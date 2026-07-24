# app/schemas/economic_calendar.py
# AlgoFin v1 — Economic calendar Pydantic schemas

from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class EconomicEventResponse(BaseModel):
    """
    Public response schema for an economic calendar event.
    Omits internal provider_event_id, raw_payload, and revision_count.
    """

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(..., description="Unique event identifier (UUID)")
    title: str = Field(..., description="Clean event title (e.g. CPI, Nonfarm Payrolls)")
    country: str = Field(..., description="Country name (e.g. United States)")
    currency: str = Field(..., description="Uppercase currency code (e.g. USD, EUR)")
    impact: str = Field(..., description="Impact level: High, Medium, Low")
    event_time: str = Field(..., description="ISO 8601 UTC release timestamp")
    actual: Optional[str] = Field(None, description="Released value or null if upcoming")
    forecast: Optional[str] = Field(None, description="Consensus forecast value or null")
    previous: Optional[str] = Field(None, description="Previous release value or null")
    source: str = Field(..., description="Data provider source (e.g. FMP)")
    status: str = Field(..., description="Dynamic status: Completed, Upcoming, Ongoing")
    last_updated_at: str = Field(..., description="ISO 8601 UTC last update timestamp")


class EconomicSummaryResponse(BaseModel):
    """
    Aggregated event counts for summary KPI cards.
    """

    high: int = Field(0, description="Count of High impact events")
    medium: int = Field(0, description="Count of Medium impact events")
    low: int = Field(0, description="Count of Low impact events")
    total: int = Field(0, description="Total count of events matching criteria")


class EconomicCalendarMetadataResponse(BaseModel):
    """
    API metadata payload for frontend debugging and freshness tracking.
    """

    provider: str = Field(..., description="Primary provider name (e.g. FMP)")
    cached: bool = Field(..., description="True if payload was served from Redis cache")
    cache_age_seconds: int = Field(..., description="Age of Redis cached payload in seconds")
    data_age_minutes: int = Field(..., description="Minutes since last successful provider sync")
    total_results: int = Field(..., description="Total number of events returned")


class EconomicCalendarApiResponse(BaseModel):
    """
    Unified API response payload for GET /api/v1/economic-calendar.
    """

    events: List[EconomicEventResponse]
    summary: EconomicSummaryResponse
    metadata: EconomicCalendarMetadataResponse


class EconomicCalendarStatusResponse(BaseModel):
    """
    Protected health telemetry response for GET /api/v1/economic-calendar/status.
    """

    provider: str
    provider_version: str
    last_successful_sync: Optional[str] = None
    last_failed_sync: Optional[str] = None
    last_error: Optional[str] = None
    data_age_minutes: Optional[int] = None
    total_events_count: int = 0
    last_sync_duration_ms: Optional[int] = None
    last_http_status: Optional[int] = None
