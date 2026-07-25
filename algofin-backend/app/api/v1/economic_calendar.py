# app/api/v1/economic_calendar.py
# AlgoFin v1 — Versioned Economic Calendar FastAPI endpoints

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as aioredis

from app.common.deps import get_db, get_current_admin
from app.common.rate_limit import limiter
from app.database import get_redis_client
from app.models.user import User
from app.schemas.economic_calendar import (
    EconomicCalendarApiResponse,
    EconomicCalendarStatusResponse,
)
from app.services.economic_calendar_service import EconomicCalendarService
from app.services.economic_calendar_cache import EconomicCalendarCache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/economic-calendar", tags=["economic-calendar"])


@router.get(
    "",
    response_model=EconomicCalendarApiResponse,
    summary="Get filtered economic calendar events",
    description=(
        "Fetch cached economic calendar events filtered by look-ahead days (1-30), "
        "impact level (High, Medium, Low), currency code (USD, EUR, GBP, JPY, etc.), "
        "and search term. Results ordered by event_time ASC."
    ),
)
@limiter.limit("120/minute")
async def get_economic_calendar(
    request: Request,
    days: int = Query(default=7, ge=1, le=30, description="Days lookahead window"),
    impact: Optional[str] = Query(default=None, description="Impact: High | Medium | Low | All"),
    currency: Optional[str] = Query(default=None, description="Currency code: USD, EUR, etc. or All"),
    search: Optional[str] = Query(default=None, description="Search event title or country"),
    db: AsyncSession = Depends(get_db),
) -> EconomicCalendarApiResponse:
    """
    Public economic calendar API endpoint.
    Multi-layer resolution: Redis (5m TTL) -> PostgreSQL -> TradingView Provider sync.
    """
    from fastapi import HTTPException

    redis_client: Optional[aioredis.Redis] = None
    try:
        redis_client = await get_redis_client()
    except Exception as exc:
        logger.warning(f"[EconomicCalendarAPI] Redis client error: {exc}")

    # Normalize filter values — treat "All" as no filter
    impact_filter = None if (not impact or impact.lower() == "all") else impact
    currency_filter = None if (not currency or currency.lower() == "all") else currency

    try:
        service = EconomicCalendarService(db)
        payload = await service.get_calendar_response(
            days=days,
            impact=impact_filter,
            currency=currency_filter,
            search=search,
            redis=redis_client,
        )
        return EconomicCalendarApiResponse(**payload)
    except Exception as exc:
        logger.error(f"[EconomicCalendarAPI] Unhandled error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Economic calendar error: {str(exc)}")


@router.get(
    "/status",
    response_model=EconomicCalendarStatusResponse,
    summary="Get economic calendar sync health & metrics (Admin Only)",
    description="Returns telemetry metrics regarding provider sync status, data age, and error history.",
)
@limiter.limit("30/minute")
async def get_economic_calendar_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
) -> EconomicCalendarStatusResponse:
    """
    Protected health & telemetry status endpoint (Admin authorization required).
    """
    redis_client: Optional[aioredis.Redis] = None
    try:
        redis_client = await get_redis_client()
    except Exception as exc:
        logger.warning(f"[EconomicCalendarAPI] Redis client error: {exc}")

    service = EconomicCalendarService(db)

    metrics = None
    if redis_client:
        metrics = await EconomicCalendarCache.get_sync_metrics(redis_client)

    if not metrics:
        total_count = await service.repo.get_total_events_count()
        metrics = {
            "provider": service.provider.provider_name,
            "provider_version": service.provider.provider_version,
            "last_successful_sync": None,
            "last_failed_sync": None,
            "last_error": None,
            "data_age_minutes": None,
            "total_events_count": total_count,
            "last_sync_duration_ms": None,
            "last_http_status": None,
        }

    return EconomicCalendarStatusResponse(**metrics)
