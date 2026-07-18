# tests/test_health.py
# AlgoFin — health endpoint tests

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_returns_200(client: AsyncClient):
    """GET /health must return HTTP 200."""
    r = await client.get("/health")
    assert r.status_code == 200


@pytest.mark.asyncio
async def test_health_has_required_fields(client: AsyncClient):
    """GET /health must return status, version, database, redis fields."""
    r = await client.get("/health")
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert "database" in body
    assert "redis" in body


@pytest.mark.asyncio
async def test_health_version_format(client: AsyncClient):
    """Version must be a non-empty string."""
    r = await client.get("/health")
    version = r.json()["version"]
    assert isinstance(version, str)
    assert len(version) > 0


@pytest.mark.asyncio
async def test_not_found_returns_404(client: AsyncClient):
    """Unknown routes must return 404."""
    r = await client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
