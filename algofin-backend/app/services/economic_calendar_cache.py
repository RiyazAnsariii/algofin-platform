# app/services/economic_calendar_cache.py
# AlgoFin v1 — Versioned Redis cache manager for economic calendar

import hashlib
import json
import logging
from typing import Optional, Any, Dict

import redis.asyncio as aioredis
from app.config import settings

logger = logging.getLogger(__name__)


class EconomicCalendarCache:
    """
    Versioned Redis cache manager.
    Queries & summaries are namespaced under a global version integer key ('econ:v1:version').
    Incrementing the version key immediately invalidates all cached responses without keys() scans.
    Wraps all operations in try/except for graceful fallback if Redis is unreachable.
    """

    VERSION_KEY = "econ:v1:version"
    METRICS_KEY = "econ:v1:sync_metrics"
    LOCK_KEY = "econ:v1:sync_lock"
    TTL_SECONDS = settings.economic_calendar_cache_ttl_seconds

    @classmethod
    async def get_version(cls, redis: aioredis.Redis) -> int:
        """Get current cache version. Defaults to 1 if not set."""
        try:
            val = await redis.get(cls.VERSION_KEY)
            return int(val) if val else 1
        except Exception as exc:
            logger.warning(f"[EconomicCalendarCache] Redis get_version error: {exc}")
            return 1

    @classmethod
    async def increment_version(cls, redis: aioredis.Redis) -> int:
        """Increment global version to instantly invalidate all cached queries."""
        try:
            return await redis.incr(cls.VERSION_KEY)
        except Exception as exc:
            logger.warning(f"[EconomicCalendarCache] Redis increment_version error: {exc}")
            return 1

    @classmethod
    async def get_cached_response(
        cls,
        redis: aioredis.Redis,
        days: int,
        impact: Optional[str],
        currency: Optional[str],
        search: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached API response dictionary from Redis."""
        try:
            version = await cls.get_version(redis)
            raw_params = f"{days}|{impact or ''}|{currency or ''}|{search or ''}"
            params_hash = hashlib.md5(raw_params.encode("utf-8")).hexdigest()
            cache_key = f"econ:v1:query:{version}:{params_hash}"

            data = await redis.get(cache_key)
            if data:
                payload = json.loads(data)
                return payload
        except Exception as exc:
            logger.warning(f"[EconomicCalendarCache] Redis get_cached_response error: {exc}")
        return None

    @classmethod
    async def set_cached_response(
        cls,
        redis: aioredis.Redis,
        days: int,
        impact: Optional[str],
        currency: Optional[str],
        search: Optional[str],
        payload: Dict[str, Any],
    ) -> None:
        """Save API response dictionary to Redis with TTL."""
        try:
            version = await cls.get_version(redis)
            raw_params = f"{days}|{impact or ''}|{currency or ''}|{search or ''}"
            params_hash = hashlib.md5(raw_params.encode("utf-8")).hexdigest()
            cache_key = f"econ:v1:query:{version}:{params_hash}"

            await redis.set(cache_key, json.dumps(payload), ex=cls.TTL_SECONDS)
        except Exception as exc:
            logger.warning(f"[EconomicCalendarCache] Redis set_cached_response error: {exc}")

    @classmethod
    async def get_sync_metrics(cls, redis: aioredis.Redis) -> Optional[Dict[str, Any]]:
        """Get latest provider sync health metrics."""
        try:
            data = await redis.get(cls.METRICS_KEY)
            if data:
                return json.loads(data)
        except Exception as exc:
            logger.warning(f"[EconomicCalendarCache] Redis get_sync_metrics error: {exc}")
        return None

    @classmethod
    async def set_sync_metrics(cls, redis: aioredis.Redis, metrics: Dict[str, Any]) -> None:
        """Set latest provider sync health metrics."""
        try:
            await redis.set(cls.METRICS_KEY, json.dumps(metrics))
        except Exception as exc:
            logger.warning(f"[EconomicCalendarCache] Redis set_sync_metrics error: {exc}")

    @classmethod
    async def acquire_lock(cls, redis: aioredis.Redis, ttl_seconds: int = 60) -> bool:
        """Acquire distributed lock for startup sync."""
        try:
            res = await redis.set(cls.LOCK_KEY, "locked", nx=True, ex=ttl_seconds)
            return bool(res)
        except Exception as exc:
            logger.warning(f"[EconomicCalendarCache] Redis acquire_lock error: {exc}")
            return True  # Fallback to true if Redis fails to allow execution

    @classmethod
    async def release_lock(cls, redis: aioredis.Redis) -> None:
        """Release startup sync lock."""
        try:
            await redis.delete(cls.LOCK_KEY)
        except Exception as exc:
            logger.warning(f"[EconomicCalendarCache] Redis release_lock error: {exc}")
