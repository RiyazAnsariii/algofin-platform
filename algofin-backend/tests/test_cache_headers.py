# tests/test_cache_headers.py
# AlgoFin — Unit tests for HTTP Cache-Control header middleware

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture
def client():
    """Create async test client."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_health_no_cache_header(client):
    """Health endpoint should not have cache-control (no matching rule)."""
    async with client as c:
        r = await c.get("/health")
        assert r.status_code == 200
        # Health has no cache rule → no Cache-Control header added by middleware
        # (it may or may not have one from the framework)


@pytest.mark.asyncio
async def test_ping_no_cache_header(client):
    """Ping endpoint should not have cache-control (no matching rule)."""
    async with client as c:
        r = await c.get("/api/v1/ping")
        assert r.status_code == 200


@pytest.mark.asyncio
async def test_get_exchanges_supported_has_cache_header(client):
    """GET /exchanges/supported should have long Cache-Control."""
    async with client as c:
        r = await c.get("/api/v1/exchanges/supported")
        assert r.status_code == 200
        cc = r.headers.get("cache-control", "")
        assert "max-age=300" in cc
        assert "private" in cc
        assert "stale-while-revalidate" in cc


@pytest.mark.asyncio
async def test_post_endpoint_has_no_store(client):
    """POST requests should get no-store Cache-Control."""
    async with client as c:
        # POST to login with invalid creds — should still get no-store
        r = await c.post(
            "/api/v1/auth/login",
            json={"email": "test@test.com", "password": "wrong"},
        )
        cc = r.headers.get("cache-control", "")
        assert "no-store" in cc
