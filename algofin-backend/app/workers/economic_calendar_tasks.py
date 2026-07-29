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

    IMPORTANT: Always bumps the Redis cache version on startup so stale cached responses
    (which may contain now-blacklisted events or wrong impacts) are immediately invalidated
    after any code deployment. This ensures blacklist rule changes take effect instantly.
    """
    try:
        service = EconomicCalendarService(db)

        # 0. ALWAYS bump Redis cache version on startup — this instantly invalidates all
        #    cached API responses so the new blacklist rules apply immediately.
        if redis:
            new_version = await EconomicCalendarCache.increment_version(redis)
            logger.info(f"[StartupSync] Redis cache version bumped to {new_version} — stale responses invalidated.")

        # 1. Purge any DB events that are now blacklisted by updated rules.
        #    This ensures stale blacklisted events don't serve from DB after deploy.
        try:
            from app.events.blacklist import is_event_blacklisted
            from sqlalchemy import select, delete
            from app.models.economic_event import EconomicEvent

            all_events_result = await db.execute(select(EconomicEvent))
            all_events = all_events_result.scalars().all()
            blacklisted_ids = [
                evt.id for evt in all_events
                if is_event_blacklisted(evt.title, evt.currency)
            ]
            if blacklisted_ids:
                await db.execute(
                    delete(EconomicEvent).where(EconomicEvent.id.in_(blacklisted_ids))
                )
                await db.commit()
                logger.info(f"[StartupSync] Purged {len(blacklisted_ids)} blacklisted events from DB.")
            else:
                logger.info("[StartupSync] No blacklisted events found in DB — DB is clean.")
        except Exception as purge_exc:
            logger.warning(f"[StartupSync] Non-fatal: Could not purge blacklisted events: {purge_exc}")

        # 2. Check if DB is empty or data age > 30 minutes
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
        else:
            # No sync metrics in Redis — treat as first boot
            needs_sync = True
            logger.info("[StartupSync] No sync metrics found. Triggering immediate sync.")

        if not needs_sync:
            logger.info("[StartupSync] Data is fresh. Skipping startup sync.")
            return

        # 3. Acquire Redis lock to prevent duplicate sync jobs across multiple workers
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

