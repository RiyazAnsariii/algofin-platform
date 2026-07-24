# app/events/router.py
# AlgoFin v1 — Economic calendar endpoints
# GET /events  (filter by impact, currency, date)
#
# This is an ECONOMIC CALENDAR — NOT a news feed.
# Label: "Economic Calendar" (plan.md Section 7)

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query
from sqlalchemy import and_, select

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.config import settings
from app.events.service import seed_events_if_empty
from app.models.events import EconomicEvent

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=SuccessResponse[list[dict]])
async def list_events(
    current_user: CurrentUser,
    db: DbSession,
    impact: str | None = Query(default=None, description="low | medium | high"),
    currency: str | None = Query(default=None, description="USD, EUR, etc."),
    days_ahead: int = Query(default=7, ge=1, le=30),
) -> SuccessResponse[list[dict]]:
    """
    Economic calendar events.
    Filtered by impact level, currency, and look-ahead window.
    plan.md Section 7 — Economic Events Module.
    """
    await seed_events_if_empty(db)

    now = datetime.now(timezone.utc)
    end = now + timedelta(days=days_ahead)

    filters = [
        EconomicEvent.event_time >= now,
        EconomicEvent.event_time <= end,
    ]
    if impact:
        filters.append(EconomicEvent.impact == impact)
    if currency:
        filters.append(EconomicEvent.currency == currency.upper())

    result = await db.execute(
        select(EconomicEvent)
        .where(and_(*filters))
        .order_by(EconomicEvent.event_time)
        .limit(200)
    )
    events = result.scalars().all()

    # Compute staleness
    stale_threshold = timedelta(minutes=settings.stale_events_minutes)

    def _is_stale(event: EconomicEvent) -> bool:
        fetched = event.fetched_at
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        return (now - fetched) > stale_threshold

    return SuccessResponse(
        data=[
            {
                "id": str(e.id),
                "title": e.title,
                "currency": e.currency,
                "country": e.country,
                "impact": e.impact,
                "event_time": e.event_time.isoformat(),
                "forecast": e.forecast,
                "previous": e.previous,
                "actual": e.actual,
                "source": e.source,
                "fetched_at": e.fetched_at.isoformat(),
                "is_stale": _is_stale(e),
            }
            for e in events
        ]
    )
