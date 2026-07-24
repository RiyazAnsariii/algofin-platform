# tests/test_events.py
# AlgoFin — Unit tests for Economic Events module and auto-seeding

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.common.security import create_access_token


@pytest.mark.asyncio
async def test_get_events_authenticated(client: AsyncClient, db: AsyncSession):
    """GET /api/v1/events should return real economic events."""
    user = User(
        id=uuid.uuid4(),
        email="events_user@example.com",
        hashed_password="dummy_hash",
        full_name="Events User",
        is_active=True,
    )
    db.add(user)
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/events?days_ahead=7", headers=headers)
    assert res.status_code == 200
    payload = res.json()
    assert payload["success"] is True
    assert isinstance(payload["data"], list)
    assert len(payload["data"]) > 0

    first_evt = payload["data"][0]
    assert "title" in first_evt
    assert "currency" in first_evt
    assert "impact" in first_evt
    assert "event_time" in first_evt


@pytest.mark.asyncio
async def test_get_events_impact_filter(client: AsyncClient, db: AsyncSession):
    """GET /api/v1/events?impact=high should filter by high impact events."""
    user = User(
        id=uuid.uuid4(),
        email="events_user2@example.com",
        hashed_password="dummy_hash",
        full_name="Events User 2",
        is_active=True,
    )
    db.add(user)
    await db.commit()

    token = create_access_token({"sub": str(user.id)})
    headers = {"Authorization": f"Bearer {token}"}

    res = await client.get("/api/v1/events?impact=high", headers=headers)
    assert res.status_code == 200
    payload = res.json()
    events = payload["data"]
    for evt in events:
        assert evt["impact"] == "high"


@pytest.mark.asyncio
async def test_get_events_unauthenticated(client: AsyncClient):
    """GET /api/v1/events without token should return 403 Forbidden."""
    res = await client.get("/api/v1/events")
    assert res.status_code == 403
