# tests/test_economic_calendar.py
# AlgoFin v1 — Economic calendar test suite

import uuid
from datetime import datetime, timedelta, timezone, date
import pytest
import httpx
from sqlalchemy import select

from app.models.economic_event import EconomicEvent
from app.providers.base import NormalizedEventDTO
from app.providers.fmp_provider import FMPProvider
from app.repositories.economic_calendar_repository import EconomicCalendarRepository
from app.services.economic_calendar_service import EconomicCalendarService
from app.services.economic_calendar_cache import EconomicCalendarCache


@pytest.mark.asyncio
async def test_dynamic_status_calculation():
    """Verify dynamic status evaluation: Completed, Ongoing, Upcoming."""
    now = datetime.now(timezone.utc)

    # 1. Completed status: actual is present
    status_completed = EconomicCalendarService.calculate_status(
        event_time_utc=now - timedelta(hours=1), actual="53.8"
    )
    assert status_completed == "Completed"

    # 2. Ongoing status: release window (within +15 minutes of release)
    status_ongoing = EconomicCalendarService.calculate_status(
        event_time_utc=now - timedelta(minutes=5), actual=None
    )
    assert status_ongoing == "Ongoing"

    # 3. Upcoming status: future event
    status_upcoming = EconomicCalendarService.calculate_status(
        event_time_utc=now + timedelta(hours=2), actual=None
    )
    assert status_upcoming == "Upcoming"


@pytest.mark.asyncio
async def test_fmp_provider_normalization():
    """Test FMPProvider normalization of raw API JSON objects."""
    provider = FMPProvider(api_key="test_key")
    raw_item = {
        "id": "fmp-101",
        "title": " Core CPI m/m ",
        "country": " United States ",
        "currency": "usd",
        "impact": "high",
        "date": "2026-07-25 14:30:00",
        "actual": "0.3%",
        "estimate": "0.2%",
        "previous": "0.2%",
    }

    dto = provider._normalize_item(raw_item)
    assert dto.provider_event_id == "fmp-101"
    assert dto.title == "Core CPI m/m"
    assert dto.country == "United States"
    assert dto.currency == "USD"
    assert dto.impact == "High"
    assert dto.actual == "0.3%"
    assert dto.forecast == "0.2%"
    assert dto.previous == "0.2%"
    assert dto.source == "FMP"
    assert len(dto.event_hash) == 64  # Valid SHA256 hex string


@pytest.mark.asyncio
async def test_bulk_upsert_and_revision_count(db):
    """Test single-transaction bulk upsert and revision_count increment."""
    repo = EconomicCalendarRepository(db)
    now = datetime.now(timezone.utc)

    dto1 = NormalizedEventDTO(
        provider_event_id="evt-001",
        event_hash="hash-001",
        title="Nonfarm Payrolls",
        country="United States",
        currency="USD",
        impact="High",
        event_time_utc=now,
        actual=None,
        forecast="185K",
        previous="175K",
        source="FMP",
        raw_payload={"test": 1},
    )

    # Initial insert
    upserted_1 = await repo.bulk_upsert_events([dto1])
    assert upserted_1 == 1

    # Verify event stored
    res = await db.execute(
        select(EconomicEvent).where(EconomicEvent.provider_event_id == "evt-001")
    )
    event_row = res.scalar_one()
    assert event_row.title == "Nonfarm Payrolls"
    assert event_row.actual is None
    assert event_row.revision_count == 0

    # Re-sync with actual value released (revision)
    dto1_revised = NormalizedEventDTO(
        provider_event_id="evt-001",
        event_hash="hash-001",
        title="Nonfarm Payrolls",
        country="United States",
        currency="USD",
        impact="High",
        event_time_utc=now,
        actual="210K",
        forecast="185K",
        previous="175K",
        source="FMP",
        raw_payload={"test": 2},
    )

    upserted_2 = await repo.bulk_upsert_events([dto1_revised])
    assert upserted_2 == 1

    # Verify revision_count incremented to 1
    res = await db.execute(
        select(EconomicEvent).where(EconomicEvent.provider_event_id == "evt-001")
    )
    event_revised = res.scalar_one()
    assert event_revised.actual == "210K"
    assert event_revised.revision_count == 1


@pytest.mark.asyncio
async def test_multi_provider_composite_unique_constraint(db):
    """Verify that identical provider_event_ids from distinct sources do not collide."""
    repo = EconomicCalendarRepository(db)
    now = datetime.now(timezone.utc)

    # Same provider_event_id 'shared-123' from FMP and ForexFactory
    dto_fmp = NormalizedEventDTO(
        provider_event_id="shared-123",
        event_hash="hash-fmp",
        title="Retail Sales",
        country="United States",
        currency="USD",
        impact="Medium",
        event_time_utc=now,
        actual="0.4%",
        forecast="0.3%",
        previous="0.2%",
        source="FMP",
        raw_payload=None,
    )

    dto_ff = NormalizedEventDTO(
        provider_event_id="shared-123",
        event_hash="hash-ff",
        title="Retail Sales",
        country="United States",
        currency="USD",
        impact="Medium",
        event_time_utc=now,
        actual="0.4%",
        forecast="0.3%",
        previous="0.2%",
        source="ForexFactory",
        raw_payload=None,
    )

    await repo.bulk_upsert_events([dto_fmp, dto_ff])

    res = await db.execute(
        select(EconomicEvent).where(EconomicEvent.provider_event_id == "shared-123")
    )
    rows = res.scalars().all()
    assert len(rows) == 2
    sources = {r.source for r in rows}
    assert sources == {"FMP", "ForexFactory"}


@pytest.mark.asyncio
async def test_ilike_partial_search_matching(db):
    """Verify case-insensitive partial substring search using repository."""
    repo = EconomicCalendarRepository(db)
    now = datetime.now(timezone.utc)

    evt = NormalizedEventDTO(
        provider_event_id="search-01",
        event_hash="search-hash-01",
        title="German Flash Inflation Rate YoY",
        country="Germany",
        currency="EUR",
        impact="High",
        event_time_utc=now,
        actual="2.2%",
        forecast="2.3%",
        previous="2.5%",
        source="FMP",
        raw_payload=None,
    )
    await repo.bulk_upsert_events([evt])

    # Partial case-insensitive query 'infl' should match 'Inflation Rate'
    matches = await repo.get_filtered_events(search="infl")
    assert len(matches) >= 1
    titles = [m.title for m in matches]
    assert "German Flash Inflation Rate YoY" in titles

    # Country search 'germ' should match 'Germany'
    country_matches = await repo.get_filtered_events(search="germ")
    assert len(country_matches) >= 1


@pytest.mark.asyncio
async def test_api_schema_data_privacy(client, db):
    """Verify GET /api/v1/economic-calendar omits internal provider_event_id, raw_payload, and revision_count."""
    repo = EconomicCalendarRepository(db)
    now = datetime.now(timezone.utc)

    evt = NormalizedEventDTO(
        provider_event_id="private-id-999",
        event_hash="private-hash-999",
        title="US Core PCE Price Index m/m",
        country="United States",
        currency="USD",
        impact="High",
        event_time_utc=now,
        actual="0.2%",
        forecast="0.2%",
        previous="0.1%",
        source="FMP",
        raw_payload={"secret_internal_key": "private_data"},
    )
    await repo.bulk_upsert_events([evt])

    response = await client.get("/api/v1/economic-calendar?search=PCE")
    assert response.status_code == 200

    data = response.json()
    assert "events" in data
    assert "summary" in data
    assert "metadata" in data

    for event in data["events"]:
        assert "provider_event_id" not in event
        assert "raw_payload" not in event
        assert "revision_count" not in event
        assert "id" in event
        assert "title" in event
        assert "status" in event


@pytest.mark.asyncio
async def test_redis_offline_graceful_fallback(db):
    """Verify EconomicCalendarService and Cache operate gracefully when Redis is None / offline."""
    service = EconomicCalendarService(db)

    # Calling get_calendar_response with redis=None should fallback cleanly to DB
    res = await service.get_calendar_response(days=7, redis=None)
    assert "events" in res
    assert "summary" in res
    assert res["metadata"]["cached"] is False
