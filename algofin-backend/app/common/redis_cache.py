# app/common/redis_cache.py
# AlgoFin — Redis-backed server-side cache decorator for expensive endpoints.
#
# Usage:
#   from app.common.redis_cache import redis_cache, invalidate_redis_cache
#
#   @redis_cache(prefix="journal:analytics", ttl=60)
#   async def get_journal_analytics(db, user_id, days, ...):
#       ...  # expensive SQL
#
#   # After a mutation:
#   await invalidate_redis_cache("journal:analytics", user_id=user_id)

import json
import hashlib
import logging
from functools import wraps
from typing import Any, Callable

logger = logging.getLogger(__name__)


async def _get_redis():
    """Get Redis client, returning None if unavailable (fail-open)."""
    try:
        from app.database import get_redis_client
        return await get_redis_client()
    except Exception:
        return None


def _build_cache_key(prefix: str, **kwargs: Any) -> str:
    """Build a deterministic cache key from prefix and keyword arguments."""
    # Sort kwargs for deterministic key regardless of call order
    parts = sorted(f"{k}={v}" for k, v in kwargs.items() if v is not None)
    raw = f"cache:{prefix}:{':'.join(parts)}"
    # Use MD5 hash for long keys to stay within Redis key length limits
    if len(raw) > 128:
        hashed = hashlib.md5(raw.encode()).hexdigest()
        return f"cache:{prefix}:{hashed}"
    return raw


def redis_cache(prefix: str, ttl: int = 60, key_args: list[str] | None = None):
    """
    Decorator that caches async function results in Redis.

    Args:
        prefix: Cache key prefix (e.g. "journal:analytics")
        ttl: Time-to-live in seconds (default: 60)
        key_args: List of argument names to include in the cache key.
                  If None, all keyword arguments except 'db' are used.

    Fail-open: If Redis is unavailable, the function executes normally
    without caching. Never raises due to cache issues.
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key from specified args (skip 'db' session)
            if key_args:
                cache_kwargs = {k: kwargs.get(k) for k in key_args}
            else:
                cache_kwargs = {
                    k: v for k, v in kwargs.items()
                    if k != "db" and not hasattr(v, "execute")  # skip DB session
                }

            cache_key = _build_cache_key(prefix, **cache_kwargs)

            # Try to read from Redis
            redis = await _get_redis()
            if redis:
                try:
                    cached = await redis.get(cache_key)
                    if cached is not None:
                        logger.debug(f"[RedisCache] HIT: {cache_key}")
                        return json.loads(cached)
                except Exception as e:
                    logger.warning(f"[RedisCache] Read error: {e}")

            # Cache miss — execute the function
            result = await func(*args, **kwargs)

            # Store result in Redis
            if redis and result is not None:
                try:
                    serialized = json.dumps(result, default=str)
                    await redis.set(cache_key, serialized, ex=ttl)
                    logger.debug(f"[RedisCache] SET: {cache_key} (ttl={ttl}s)")
                except Exception as e:
                    logger.warning(f"[RedisCache] Write error: {e}")

            return result

        # Attach metadata so callers can inspect cache config
        wrapper._cache_prefix = prefix
        wrapper._cache_ttl = ttl
        return wrapper

    return decorator


async def invalidate_redis_cache(prefix: str, **kwargs: Any) -> None:
    """
    Invalidate a specific cached entry or all entries under a prefix.

    Usage:
        # Invalidate specific entry:
        await invalidate_redis_cache("journal:analytics", user_id="abc", days=30)

        # Invalidate all entries under prefix (uses SCAN):
        await invalidate_redis_cache("journal:analytics")
    """
    redis = await _get_redis()
    if not redis:
        return

    try:
        if kwargs:
            # Invalidate specific key
            cache_key = _build_cache_key(prefix, **kwargs)
            await redis.delete(cache_key)
            logger.debug(f"[RedisCache] INVALIDATE: {cache_key}")
        else:
            # Invalidate all keys under prefix using SCAN (non-blocking)
            pattern = f"cache:{prefix}:*"
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = await redis.scan(cursor, match=pattern, count=100)
                if keys:
                    await redis.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
            if deleted:
                logger.debug(
                    f"[RedisCache] INVALIDATE pattern '{pattern}': {deleted} keys"
                )
    except Exception as e:
        logger.warning(f"[RedisCache] Invalidation error: {e}")
