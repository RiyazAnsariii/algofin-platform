# app/services/economic_calendar_service.py
# AlgoFin v1 — Economic calendar core application service

import json
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Any, Optional, List

from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.config import settings
from app.models.economic_event import EconomicEvent
from app.events.blacklist import is_event_blacklisted
from app.providers import get_economic_calendar_provider
from app.repositories.economic_calendar_repository import EconomicCalendarRepository
from app.services.economic_calendar_cache import EconomicCalendarCache

logger = logging.getLogger(__name__)


class EconomicCalendarService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = EconomicCalendarRepository(db)
        self.provider = get_economic_calendar_provider()

    @staticmethod
    def calculate_status(event_time_utc: datetime, actual: Optional[str]) -> str:
        """
        Dynamically calculate event status for V1:
          - Completed: actual value is present and non-empty
          - Ongoing: within 15-minute release window (event_time <= now <= event_time + 15m)
          - Upcoming: prior to release window (now < event_time)
        """
        if actual is not None and str(actual).strip() != "":
            return "Completed"

        now = datetime.now(timezone.utc)
        if event_time_utc.tzinfo is None:
            event_time_utc = event_time_utc.replace(tzinfo=timezone.utc)

        release_window_end = event_time_utc + timedelta(minutes=15)

        if event_time_utc <= now <= release_window_end:
            return "Ongoing"
        elif now > release_window_end:
            # Past release window without actual value released yet — marked Ongoing for V1
            return "Ongoing"
        else:
            return "Upcoming"

    async def sync_events(
        self, from_date: date, to_date: date, redis: Optional[aioredis.Redis] = None
    ) -> Dict[str, Any]:
        """
        Fetch rolling window of events from provider, bulk upsert into DB, invalidate Redis cache, and log structured metrics.
        """
        start_time = time.perf_counter()
        now_iso = datetime.now(timezone.utc).isoformat()

        metrics: Dict[str, Any] = {
            "provider": self.provider.provider_name,
            "provider_version": self.provider.provider_version,
            "last_successful_sync": None,
            "last_failed_sync": None,
            "last_error": None,
            "data_age_minutes": 0,
            "total_events_count": 0,
            "last_sync_duration_ms": 0,
            "last_http_status": None,
        }

        # Load existing metrics from Redis if available
        if redis:
            existing_metrics = await EconomicCalendarCache.get_sync_metrics(redis)
            if existing_metrics:
                metrics.update(existing_metrics)

        try:
            logger.info(
                f"[EconomicCalendarService] Starting sync for period {from_date} to {to_date} via {self.provider.provider_name}"
            )
            events_dto, http_status = await self.provider.fetch_events(from_date, to_date)
            upsert_count = await self.repo.bulk_upsert_events(events_dto)

            total_count = await self.repo.get_total_events_count()
            duration_ms = int((time.perf_counter() - start_time) * 1000)

            metrics.update(
                {
                    "provider": self.provider.provider_name,
                    "provider_version": self.provider.provider_version,
                    "last_successful_sync": now_iso,
                    "last_error": None,
                    "data_age_minutes": 0,
                    "total_events_count": total_count,
                    "last_sync_duration_ms": duration_ms,
                    "last_http_status": http_status,
                }
            )

            if redis:
                await EconomicCalendarCache.set_sync_metrics(redis, metrics)
                await EconomicCalendarCache.increment_version(redis)

            # Enriched structured logging output
            structured_log = {
                "event": "economic_calendar_sync_success",
                "provider": self.provider.provider_name,
                "provider_version": self.provider.provider_version,
                "duration_ms": duration_ms,
                "events_fetched": len(events_dto),
                "events_upserted": upsert_count,
                "total_events": total_count,
                "status_code": http_status,
            }
            logger.info(json.dumps(structured_log))
            return metrics

        except Exception as exc:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            error_msg = str(exc)

            metrics.update(
                {
                    "provider": self.provider.provider_name,
                    "provider_version": self.provider.provider_version,
                    "last_failed_sync": now_iso,
                    "last_error": error_msg,
                    "last_sync_duration_ms": duration_ms,
                    "last_http_status": 500,
                }
            )

            if redis:
                await EconomicCalendarCache.set_sync_metrics(redis, metrics)

            structured_log = {
                "event": "economic_calendar_sync_failure",
                "provider": self.provider.provider_name,
                "provider_version": self.provider.provider_version,
                "duration_ms": duration_ms,
                "error": error_msg,
            }
            logger.error(json.dumps(structured_log))
            return metrics

    async def get_calendar_response(
        self,
        days: int = 7,
        impact: Optional[str] = None,
        currency: Optional[str] = None,
        search: Optional[str] = None,
        redis: Optional[aioredis.Redis] = None,
    ) -> Dict[str, Any]:
        """
        Get API payload with events, summary, and metadata.
        Checks Redis cache first. If missed, queries DB, formats, caches in Redis, and returns.
        """
        cache_start = time.perf_counter()

        # 1. Check Redis cache if redis client is available
        if redis:
            cached_data = await EconomicCalendarCache.get_cached_response(
                redis, days=days, impact=impact, currency=currency, search=search
            )
            if cached_data:
                cache_age = int(time.perf_counter() - cache_start)
                if "metadata" in cached_data:
                    cached_data["metadata"]["cached"] = True
                    cached_data["metadata"]["cache_age_seconds"] = cache_age
                return cached_data

        # 2. Query PostgreSQL database
        db_events = await self.repo.get_filtered_events(
            days=days, impact=impact, currency=currency, search=search
        )
        # If DB is empty, trigger a live sync first (no seed fallback needed with live provider)
        if not db_events:
            from datetime import date, timedelta
            today = date.today()
            await self.sync_events(today, today + timedelta(days=30), redis=redis)
            db_events = await self.repo.get_filtered_events(
                days=days, impact=impact, currency=currency, search=search
            )

        summary = await self.repo.get_event_summary(
            days=days, impact=impact, currency=currency, search=search
        )

        # 3. Calculate data age in minutes
        data_age_minutes = 0
        if redis:
            sync_metrics = await EconomicCalendarCache.get_sync_metrics(redis)
            if sync_metrics and sync_metrics.get("last_successful_sync"):
                try:
                    last_sync_dt = datetime.fromisoformat(
                        sync_metrics["last_successful_sync"]
                    )
                    now_dt = datetime.now(timezone.utc)
                    data_age_minutes = max(
                        0, int((now_dt - last_sync_dt).total_seconds() / 60)
                    )
                except Exception:
                    data_age_minutes = 0

        # 4. Format events with dynamic status calculation
        formatted_events = []
        for e in db_events:
            if is_event_blacklisted(e.title, e.currency):
                continue
            status = self.calculate_status(e.event_time_utc, e.actual)
            formatted_events.append(
                {
                    "id": str(e.id),
                    "title": e.title,
                    "country": e.country,
                    "currency": e.currency,
                    "impact": e.impact,
                    "event_time": e.event_time_utc.isoformat(),
                    "actual": e.actual,
                    "forecast": e.forecast,
                    "previous": e.previous,
                    "source": e.source,
                    "status": status,
                    "last_updated_at": e.last_updated_at.isoformat(),
                }
            )

        payload = {
            "events": formatted_events,
            "summary": summary,
            "metadata": {
                "provider": self.provider.provider_name,
                "cached": False,
                "cache_age_seconds": 0,
                "data_age_minutes": data_age_minutes,
                "total_results": len(formatted_events),
            },
        }

        # 5. Save in Redis cache
        if redis:
            await EconomicCalendarCache.set_cached_response(
                redis,
                days=days,
                impact=impact,
                currency=currency,
                search=search,
                payload=payload,
            )

        return payload
