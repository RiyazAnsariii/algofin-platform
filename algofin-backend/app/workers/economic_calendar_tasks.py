# app/workers/economic_calendar_tasks.py
# AlgoFin v1 — Economic calendar Celery background tasks & startup sync

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone

from celery import shared_task
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.database import AsyncSessionLocal
from app.services.economic_calendar_service import EconomicCalendarService
from app.services.economic_calendar_cache import EconomicCalendarCache

logger = logging.getLogger(__name__)


@shared_task(
    name="app.workers.economic_calendar_tasks.sync_economic_calendar",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
)
def sync_economic_calendar(self):
    """
    Celery periodic task executing every 30 minutes to fetch rolling 30-day economic events.
    """

    async def _async_sync():
        async with AsyncSessionLocal() as db:
            service = EconomicCalendarService(db)
            today = date.today()
            to_date = today + timedelta(days=30)

            # Create async Redis connection if configured
            redis_client = None
            try:
                from app.config import settings

                redis_client = aioredis.from_url(
                    settings.redis_url, decode_responses=True
                )
            except Exception as exc:
                logger.warning(
                    f"[CeleryTask] Redis connection unavailable for sync task: {exc}"
                )

            try:
                metrics = await service.sync_events(today, to_date, redis=redis_client)
                return metrics
            finally:
                if redis_client:
                    await redis_client.close()

    try:
        return asyncio.run(_async_sync())
    except Exception as exc:
        logger.error(f"[CeleryTask] Error running sync_economic_calendar: {exc}")
        raise self.retry(exc=exc)


async def run_startup_sync_if_needed(db: AsyncSession, redis: aioredis.Redis) -> None:
    """
    Startup sync safeguard called on application boot (lifespan).
    If last sync was >30 minutes ago or DB is empty, attempts to acquire distributed lock and run immediate sync.
    """
    try:
        service = EconomicCalendarService(db)

        # 1. Check if DB is empty or data age > 30 minutes
        total_count = await service.repo.get_total_events_count()
        metrics = await EconomicCalendarCache.get_sync_metrics(redis)

        needs_sync = False
        if total_count == 0:
            needs_sync = True
            logger.info("[StartupSync] Database contains 0 economic events. Immediate sync needed.")
        elif metrics and metrics.get("last_successful_sync"):
            try:
                last_dt = datetime.fromisoformat(metrics["last_successful_sync"])
                now_dt = datetime.now(timezone.utc)
                age_mins = (now_dt - last_dt).total_seconds() / 60
                if age_mins >= 30:
                    needs_sync = True
                    logger.info(f"[StartupSync] Data is {int(age_mins)} mins old. Immediate sync needed.")
            except Exception:
                needs_sync = True

        if not needs_sync:
            logger.info("[StartupSync] Data is fresh. Skipping startup sync.")
            return

        # 2. Acquire Redis lock to prevent duplicate sync jobs across multiple workers
        locked = await EconomicCalendarCache.acquire_lock(redis, ttl_seconds=60)
        if not locked:
            logger.info("[StartupSync] Another worker acquired startup sync lock. Skipping.")
            return

        try:
            today = date.today()
            to_date = today + timedelta(days=30)
            logger.info("[StartupSync] Executing immediate cold-start background sync...")
            await service.sync_events(today, to_date, redis=redis)
        finally:
            await EconomicCalendarCache.release_lock(redis)

    except Exception as exc:
        logger.warning(f"[StartupSync] Non-fatal exception during startup sync: {exc}")
