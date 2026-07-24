# tests/test_redis_cache.py
# AlgoFin — Unit tests for Redis cache decorator and invalidation

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.common.redis_cache import (
    _build_cache_key,
    redis_cache,
    invalidate_redis_cache,
)


# ── Cache key tests ────────────────────────────────────────────────────────────


def test_build_cache_key_simple():
    """Cache key with simple kwargs."""
    key = _build_cache_key("journal", user_id="abc", days=30)
    assert key == "cache:journal:days=30:user_id=abc"


def test_build_cache_key_sorted():
    """Cache keys are deterministic regardless of kwarg order."""
    key1 = _build_cache_key("test", a="1", b="2", c="3")
    key2 = _build_cache_key("test", c="3", a="1", b="2")
    assert key1 == key2


def test_build_cache_key_skips_none():
    """None values are excluded from cache key."""
    key = _build_cache_key("test", user_id="abc", start_date=None)
    assert "start_date" not in key
    assert "user_id=abc" in key


def test_build_cache_key_long_hashed():
    """Long keys are hashed with MD5 to stay within Redis limits."""
    long_val = "x" * 200
    key = _build_cache_key("test", value=long_val)
    assert key.startswith("cache:test:")
    assert len(key) < 128


# ── Decorator tests ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_redis_cache_miss_calls_function():
    """On cache miss, the decorated function should be called."""
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=None)
    mock_redis.set = AsyncMock()

    call_count = 0

    @redis_cache(prefix="test", ttl=30, key_args=["user_id"])
    async def my_func(user_id="abc"):
        nonlocal call_count
        call_count += 1
        return {"result": "ok"}

    with patch("app.common.redis_cache._get_redis", return_value=mock_redis):
        result = await my_func(user_id="abc")

    assert result == {"result": "ok"}
    assert call_count == 1
    mock_redis.set.assert_called_once()


@pytest.mark.asyncio
async def test_redis_cache_hit_skips_function():
    """On cache hit, the decorated function should NOT be called."""
    cached_data = json.dumps({"result": "cached"})
    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=cached_data)

    call_count = 0

    @redis_cache(prefix="test", ttl=30, key_args=["user_id"])
    async def my_func(user_id="abc"):
        nonlocal call_count
        call_count += 1
        return {"result": "fresh"}

    with patch("app.common.redis_cache._get_redis", return_value=mock_redis):
        result = await my_func(user_id="abc")

    assert result == {"result": "cached"}
    assert call_count == 0  # Function was NOT called


@pytest.mark.asyncio
async def test_redis_cache_fail_open():
    """If Redis is unavailable, function should execute normally."""
    call_count = 0

    @redis_cache(prefix="test", ttl=30, key_args=["user_id"])
    async def my_func(user_id="abc"):
        nonlocal call_count
        call_count += 1
        return {"result": "direct"}

    with patch("app.common.redis_cache._get_redis", return_value=None):
        result = await my_func(user_id="abc")

    assert result == {"result": "direct"}
    assert call_count == 1


# ── Invalidation tests ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_invalidate_specific_key():
    """Invalidation with kwargs should delete a specific key."""
    mock_redis = AsyncMock()
    mock_redis.delete = AsyncMock()

    with patch("app.common.redis_cache._get_redis", return_value=mock_redis):
        await invalidate_redis_cache("journal", user_id="abc")

    mock_redis.delete.assert_called_once()
    call_args = mock_redis.delete.call_args[0][0]
    assert "cache:journal:" in call_args
    assert "user_id=abc" in call_args


@pytest.mark.asyncio
async def test_invalidate_prefix_uses_scan():
    """Invalidation without kwargs should use SCAN to find and delete all matching keys."""
    mock_redis = AsyncMock()
    mock_redis.scan = AsyncMock(return_value=(0, ["cache:journal:key1", "cache:journal:key2"]))
    mock_redis.delete = AsyncMock()

    with patch("app.common.redis_cache._get_redis", return_value=mock_redis):
        await invalidate_redis_cache("journal")

    mock_redis.scan.assert_called()
    mock_redis.delete.assert_called_once_with("cache:journal:key1", "cache:journal:key2")


@pytest.mark.asyncio
async def test_invalidate_no_redis_graceful():
    """Invalidation should not raise if Redis is unavailable."""
    with patch("app.common.redis_cache._get_redis", return_value=None):
        # Should not raise
        await invalidate_redis_cache("journal", user_id="abc")
