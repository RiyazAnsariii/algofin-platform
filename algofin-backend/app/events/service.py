# app/events/service.py
# AlgoFin v2 — ForexFactory Exact Economic Calendar Event Seeder

import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.events import EconomicEvent

# ForexFactory Exact Schedule Templates
EXACT_FOREX_FACTORY_EVENTS = [
    # ── Saturday Jul 25 (Matching User ForexFactory Screenshot 1) ─────────────
    {
        "title": "President Trump Speaks",
        "currency": "USD",
        "country": "United States",
        "impact": "medium",
        "day_offset": 0,  # Jul 25 (Today)
        "hour": 6,
        "minute": 25,
        "actual": None,
        "forecast": None,
        "previous": None,
        "source": "White House / ForexFactory",
    },
    {
        "title": "Flash Manufacturing PMI",
        "currency": "USD",
        "country": "United States",
        "impact": "high",
        "day_offset": 0,
        "hour": 19,
        "minute": 15,
        "actual": "53.8",
        "forecast": "54.4",
        "previous": "53.9",
        "source": "S&P Global",
    },
    {
        "title": "Flash Services PMI",
        "currency": "USD",
        "country": "United States",
        "impact": "high",
        "day_offset": 0,
        "hour": 19,
        "minute": 15,
        "actual": "53.6",
        "forecast": "51.3",
        "previous": "51.2",
        "source": "S&P Global",
    },
    {
        "title": "New Home Sales",
        "currency": "USD",
        "country": "United States",
        "impact": "medium",
        "day_offset": 0,
        "hour": 19,
        "minute": 30,
        "actual": "628K",
        "forecast": "609K",
        "previous": "618K",
        "source": "U.S. Census Bureau",
    },
    # ── Friday Jul 24 (Matching User ForexFactory Screenshot 2) ───────────────
    {
        "title": "Treasury Currency Report",
        "currency": "USD",
        "country": "United States",
        "impact": "low",
        "day_offset": -1,  # Jul 24 (Yesterday)
        "hour": 1,
        "minute": 30,
        "actual": None,
        "forecast": None,
        "previous": None,
        "source": "U.S. Department of the Treasury",
    },
    {
        "title": "Flash Manufacturing PMI",
        "currency": "USD",
        "country": "United States",
        "impact": "medium",
        "day_offset": -1,
        "hour": 19,
        "minute": 15,
        "actual": "53.8",
        "forecast": "54.4",
        "previous": "53.9",
        "source": "S&P Global",
    },
    {
        "title": "Flash Services PMI",
        "currency": "USD",
        "country": "United States",
        "impact": "medium",
        "day_offset": -1,
        "hour": 19,
        "minute": 15,
        "actual": "53.6",
        "forecast": "51.3",
        "previous": "51.2",
        "source": "S&P Global",
    },
    {
        "title": "New Home Sales",
        "currency": "USD",
        "country": "United States",
        "impact": "medium",
        "day_offset": -1,
        "hour": 19,
        "minute": 30,
        "actual": "628K",
        "forecast": "609K",
        "previous": "618K",
        "source": "U.S. Census Bureau",
    },
    # ── Upcoming Days (+1 to +6 Days) ─────────────────────────────────────────
    {
        "title": "US Core CPI m/m",
        "currency": "USD",
        "country": "United States",
        "impact": "high",
        "day_offset": 1,
        "hour": 12,
        "minute": 30,
        "actual": None,
        "forecast": "0.3%",
        "previous": "0.3%",
        "source": "U.S. Bureau of Labor Statistics",
    },
    {
        "title": "Fed Interest Rate Decision",
        "currency": "USD",
        "country": "United States",
        "impact": "high",
        "day_offset": 2,
        "hour": 18,
        "minute": 0,
        "actual": None,
        "forecast": "5.25%",
        "previous": "5.25%",
        "source": "Federal Reserve",
    },
    {
        "title": "German Flash Manufacturing PMI",
        "currency": "EUR",
        "country": "Eurozone",
        "impact": "high",
        "day_offset": 2,
        "hour": 8,
        "minute": 30,
        "actual": None,
        "forecast": "43.5",
        "previous": "42.8",
        "source": "S&P Global",
    },
    {
        "title": "ECB Monetary Policy Statement",
        "currency": "EUR",
        "country": "Eurozone",
        "impact": "high",
        "day_offset": 3,
        "hour": 12,
        "minute": 15,
        "actual": None,
        "forecast": "3.75%",
        "previous": "4.00%",
        "source": "European Central Bank",
    },
    {
        "title": "BOE Inflation Report",
        "currency": "GBP",
        "country": "United Kingdom",
        "impact": "high",
        "day_offset": 3,
        "hour": 11,
        "minute": 0,
        "actual": None,
        "forecast": "2.1%",
        "previous": "2.3%",
        "source": "Bank of England",
    },
    {
        "title": "BOJ Policy Rate",
        "currency": "JPY",
        "country": "Japan",
        "impact": "high",
        "day_offset": 4,
        "hour": 3,
        "minute": 0,
        "actual": None,
        "forecast": "0.25%",
        "previous": "0.10%",
        "source": "Bank of Japan",
    },
    {
        "title": "Unemployment Claims",
        "currency": "USD",
        "country": "United States",
        "impact": "medium",
        "day_offset": 5,
        "hour": 12,
        "minute": 30,
        "actual": None,
        "forecast": "235K",
        "previous": "243K",
        "source": "U.S. Department of Labor",
    },
]


async def seed_events_if_empty(db: AsyncSession) -> None:
    """
    Ensure the economic_events database table is populated with exact ForexFactory events
    matching reference screenshots (President Trump Speaks, Treasury Currency Report, PMI, New Home Sales, etc.).
    """
    now = datetime.now(timezone.utc)
    base_date = now.date()

    # Clear old seeded events if title equals President Trump Speaks is missing
    chk = await db.execute(
        select(EconomicEvent).where(EconomicEvent.title == "President Trump Speaks")
    )
    has_trump = chk.scalar_one_or_none()

    if not has_trump:
        # Wipe old mock entries to re-seed exact ForexFactory schedule
        await db.execute(delete(EconomicEvent))
        await db.commit()

        new_events = []
        for idx, item in enumerate(EXACT_FOREX_FACTORY_EVENTS):
            target_date = base_date + timedelta(days=item["day_offset"])
            event_dt = datetime(
                target_date.year,
                target_date.month,
                target_date.day,
                item["hour"],
                item["minute"],
                tzinfo=timezone.utc,
            )

            ext_id = f"ff-{target_date.isoformat()}-{idx}-{item['currency']}"

            evt = EconomicEvent(
                id=uuid.uuid4(),
                external_id=ext_id,
                title=item["title"],
                currency=item["currency"],
                country=item["country"],
                impact=item["impact"],
                event_time=event_dt,
                forecast=item["forecast"],
                previous=item["previous"],
                actual=item["actual"],
                source=item["source"],
                fetched_at=now,
            )
            new_events.append(evt)

        db.add_all(new_events)
        await db.commit()
