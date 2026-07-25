# app/repositories/economic_calendar_repository.py
# AlgoFin v1 — Economic calendar database repository

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Any
import uuid

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.economic_event import EconomicEvent
from app.providers.base import NormalizedEventDTO

logger = logging.getLogger(__name__)


class EconomicCalendarRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_filtered_events(
        self,
        days: int = 7,
        impact: Optional[str] = None,
        currency: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 300,
    ) -> List[EconomicEvent]:
        """
        Query economic events filtered by days ahead, impact level, currency, and search query.
        Results ordered strictly by event_time_utc ASC.
        """
        now = datetime.now(timezone.utc)
        # Look back 2 days to include recently completed events, and look ahead 'days'
        start_time = (now - timedelta(days=2)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end_time = now + timedelta(days=days)

        filters = [
            EconomicEvent.event_time_utc >= start_time,
            EconomicEvent.event_time_utc <= end_time,
        ]

        if impact and impact.lower() != "all":
            # Standardize impact query to title case ("High", "Medium", "Low")
            normalized_impact = impact.strip().capitalize()
            filters.append(EconomicEvent.impact == normalized_impact)

        if currency and currency.lower() != "all":
            filters.append(EconomicEvent.currency == currency.strip().upper())

        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(
                or_(
                    EconomicEvent.title.ilike(term),
                    EconomicEvent.country.ilike(term),
                )
            )

        query = (
            select(EconomicEvent)
            .where(and_(*filters))
            .order_by(EconomicEvent.event_time_utc.asc())
            .limit(limit)
        )

        result = await self.db.execute(query)
        raw_list = list(result.scalars().all())

        # Read-path deduplication: keep only one event per (title, currency, event_time_utc)
        unique_events: List[EconomicEvent] = []
        seen_keys = set()
        for evt in raw_list:
            dedup_key = (evt.title.strip().lower(), evt.currency.strip().upper(), evt.event_time_utc)
            if dedup_key not in seen_keys:
                seen_keys.add(dedup_key)
                unique_events.append(evt)

        return unique_events

    async def get_event_summary(
        self,
        days: int = 7,
        impact: Optional[str] = None,
        currency: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Dict[str, int]:
        """
        Compute SQL summary counts (High, Medium, Low, Total) matching the filter window.
        """
        now = datetime.now(timezone.utc)
        start_time = (now - timedelta(days=2)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end_time = now + timedelta(days=days)

        filters = [
            EconomicEvent.event_time_utc >= start_time,
            EconomicEvent.event_time_utc <= end_time,
        ]

        if currency and currency.lower() != "all":
            filters.append(EconomicEvent.currency == currency.strip().upper())

        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(
                or_(
                    EconomicEvent.title.ilike(term),
                    EconomicEvent.country.ilike(term),
                )
            )

        if impact and impact.lower() != "all":
            filters.append(EconomicEvent.impact == impact.strip().capitalize())

        query = (
            select(EconomicEvent.impact, func.count(EconomicEvent.id))
            .where(and_(*filters))
            .group_by(EconomicEvent.impact)
        )

        result = await self.db.execute(query)
        counts = {row[0].capitalize(): row[1] for row in result.all()}

        high = counts.get("High", 0)
        medium = counts.get("Medium", 0)
        low = counts.get("Low", 0)
        total = sum(counts.values())

        return {
            "high": high,
            "medium": medium,
            "low": low,
            "total": total,
        }

    async def bulk_upsert_events(self, events: List[NormalizedEventDTO]) -> int:
        """
        Bulk upsert list of NormalizedEventDTO into database in a single atomic transaction.
        Deduplicates on (source, provider_event_id) or (source, event_hash).
        Increments revision_count when values change.
        """
        if not events:
            return 0

        upsert_count = 0
        now = datetime.now(timezone.utc)

        for dto in events:
            # Look for existing record by provider_event_id or fallback event_hash
            existing: Optional[EconomicEvent] = None
            if dto.provider_event_id:
                res = await self.db.execute(
                    select(EconomicEvent).where(
                        EconomicEvent.source == dto.source,
                        EconomicEvent.provider_event_id == dto.provider_event_id,
                    )
                )
                existing = res.scalar_one_or_none()

            if not existing:
                res = await self.db.execute(
                    select(EconomicEvent).where(
                        EconomicEvent.source == dto.source,
                        EconomicEvent.event_hash == dto.event_hash,
                    )
                )
                existing = res.scalar_one_or_none()

            if not existing:
                res = await self.db.execute(
                    select(EconomicEvent).where(
                        EconomicEvent.title == dto.title,
                        EconomicEvent.currency == dto.currency,
                        EconomicEvent.event_time_utc == dto.event_time_utc,
                    )
                )
                existing = res.scalar_one_or_none()

            if existing:
                # Check if revised (actual, forecast, previous changed)
                revised = (
                    existing.actual != dto.actual
                    or existing.forecast != dto.forecast
                    or existing.previous != dto.previous
                )
                if revised:
                    existing.actual = dto.actual
                    existing.forecast = dto.forecast
                    existing.previous = dto.previous
                    existing.revision_count += 1
                    existing.raw_payload = dto.raw_payload
                    existing.last_updated_at = now
                    upsert_count += 1
                else:
                    # Refresh timestamp if changed
                    existing.last_updated_at = now
            else:
                # Insert new event
                new_evt = EconomicEvent(
                    id=uuid.uuid4(),
                    source=dto.source,
                    provider_event_id=dto.provider_event_id,
                    event_hash=dto.event_hash,
                    title=dto.title,
                    country=dto.country,
                    currency=dto.currency,
                    impact=dto.impact,
                    event_time_utc=dto.event_time_utc,
                    actual=dto.actual,
                    forecast=dto.forecast,
                    previous=dto.previous,
                    raw_payload=dto.raw_payload,
                    revision_count=0,
                    last_updated_at=now,
                    created_at=now,
                )
                self.db.add(new_evt)
                upsert_count += 1

        # Single atomic commit for the entire batch
        await self.db.commit()
        return upsert_count

    async def get_total_events_count(self) -> int:
        """
        Get total row count of events in database.
        """
        res = await self.db.execute(select(func.count(EconomicEvent.id)))
        return res.scalar_one() or 0

    async def seed_fallback_events_if_empty(self) -> None:
        """
        If economic_events table is empty, seed reference events.
        """
        count = await self.get_total_events_count()
        if count > 0:
            return

        import hashlib
        from app.events.service import EXACT_FOREX_FACTORY_EVENTS

        now = datetime.now(timezone.utc)
        base_date = now.date()

        dtos = []
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
            ext_id = f"seed-{target_date.isoformat()}-{idx}-{item['currency']}"
            hash_val = hashlib.sha256(
                f"FMP|{item['title']}|{item['currency']}|{item['country']}|{event_dt.isoformat()}".encode()
            ).hexdigest()

            dto = NormalizedEventDTO(
                provider_event_id=ext_id,
                event_hash=hash_val,
                title=item["title"],
                country=item["country"],
                currency=item["currency"],
                impact=item["impact"].capitalize(),
                event_time_utc=event_dt,
                actual=item["actual"],
                forecast=item["forecast"],
                previous=item["previous"],
                source="FMP",
                raw_payload=item,
            )
            dtos.append(dto)

        await self.bulk_upsert_events(dtos)
