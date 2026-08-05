# app/influencer/router.py
# Phase INF: Influencer Strategy Engine — API endpoints
#
# User routes  (/influencer/*)        — require CurrentUser
# Admin routes (/influencer/admin/*)  — require CurrentAdmin
#
# User endpoints:
#   GET    /influencer/marketplace                → list active strategies
#   GET    /influencer/marketplace/{id}           → strategy detail
#   POST   /influencer/subscriptions              → subscribe
#   GET    /influencer/subscriptions              → my subscriptions
#   GET    /influencer/subscriptions/{id}         → subscription detail
#   PATCH  /influencer/subscriptions/{id}         → update settings
#   POST   /influencer/subscriptions/{id}/pause   → pause
#   POST   /influencer/subscriptions/{id}/resume  → resume
#   DELETE /influencer/subscriptions/{id}         → stop
#   GET    /influencer/subscriptions/{id}/executions → execution history
#
# Admin endpoints:
#   GET    /influencer/admin/strategies                       → all strategies
#   POST   /influencer/admin/strategies                       → create
#   GET    /influencer/admin/strategies/{id}                  → detail (+ pine_code)
#   PATCH  /influencer/admin/strategies/{id}                  → update
#   POST   /influencer/admin/strategies/{id}/archive          → archive
#   POST   /influencer/admin/strategies/{id}/rotate-secret    → rotate webhook secret
#   GET    /influencer/admin/strategies/{id}/signals          → signal history
#   GET    /influencer/admin/strategies/{id}/subscribers      → subscriber list
#   POST   /influencer/admin/test-signal                      → send test signal (DRY_RUN)

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, status

from app.common.deps import CurrentAdmin, CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.database import get_redis_client
from app.influencer import service, signal_service
from app.influencer.schemas import (
    AdminSubscriberRow,
    InfluencerSignalResponse,
    InfluencerStrategyAdminResponse,
    InfluencerStrategyCreate,
    InfluencerStrategyPublicResponse,
    InfluencerStrategyUpdate,
    RotateSecretResponse,
    SubscriberExecutionResponse,
    SubscriptionCreate,
    SubscriptionResponse,
    SubscriptionUpdate,
    TestSignalRequest,
    TestSignalResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/influencer", tags=["Influencer Strategies"])


# ══════════════════════════════════════════════════════════════════════════════
# USER — Marketplace
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/marketplace",
    response_model=SuccessResponse[list[InfluencerStrategyPublicResponse]],
)
async def list_marketplace(db: DbSession, current_user: CurrentUser):
    """List all active strategies available in the marketplace."""
    strategies = await service.get_marketplace(db)
    return SuccessResponse(
        data=[InfluencerStrategyPublicResponse.from_orm(s) for s in strategies]
    )


@router.get(
    "/marketplace/{strategy_id}",
    response_model=SuccessResponse[InfluencerStrategyPublicResponse],
)
async def get_marketplace_strategy(
    strategy_id: str,
    db: DbSession,
    current_user: CurrentUser,
):
    """Get a single active strategy's public details."""
    try:
        strategy = await service.get_strategy_public(db, strategy_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse(data=InfluencerStrategyPublicResponse.from_orm(strategy))


# ══════════════════════════════════════════════════════════════════════════════
# USER — Subscriptions
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/subscriptions",
    response_model=SuccessResponse[SubscriptionResponse],
    status_code=status.HTTP_201_CREATED,
)
async def subscribe(
    data: SubscriptionCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    """Subscribe to an influencer strategy."""
    try:
        sub = await service.subscribe(db, str(current_user.id), data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SuccessResponse(data=SubscriptionResponse.from_orm(sub))


@router.get(
    "/subscriptions",
    response_model=SuccessResponse[list[SubscriptionResponse]],
)
async def list_my_subscriptions(db: DbSession, current_user: CurrentUser):
    """List all my strategy subscriptions."""
    rows = await service.get_my_subscriptions(db, str(current_user.id))
    return SuccessResponse(
        data=[SubscriptionResponse.from_orm(sub, strategy) for sub, strategy in rows]
    )


@router.get(
    "/subscriptions/{subscription_id}",
    response_model=SuccessResponse[SubscriptionResponse],
)
async def get_subscription(
    subscription_id: str,
    db: DbSession,
    current_user: CurrentUser,
):
    """Get a specific subscription."""
    from app.models.influencer import InfluencerSubscription, InfluencerStrategy
    from sqlalchemy import select
    import uuid

    try:
        result = await db.execute(
            select(InfluencerSubscription, InfluencerStrategy)
            .join(
                InfluencerStrategy,
                InfluencerSubscription.influencer_strategy_id == InfluencerStrategy.id,
            )
            .where(
                InfluencerSubscription.id == uuid.UUID(subscription_id),
                InfluencerSubscription.user_id == current_user.id,
            )
        )
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail="Subscription not found")
        sub, strategy = row
        return SuccessResponse(data=SubscriptionResponse.from_orm(sub, strategy))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch(
    "/subscriptions/{subscription_id}",
    response_model=SuccessResponse[SubscriptionResponse],
)
async def update_subscription(
    subscription_id: str,
    data: SubscriptionUpdate,
    db: DbSession,
    current_user: CurrentUser,
):
    """Update subscription capital, leverage, or symbol."""
    try:
        sub = await service.update_subscription(
            db, str(current_user.id), subscription_id, data
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SuccessResponse(data=SubscriptionResponse.from_orm(sub))


@router.post(
    "/subscriptions/{subscription_id}/pause",
    response_model=SuccessResponse[SubscriptionResponse],
)
async def pause_subscription(
    subscription_id: str,
    db: DbSession,
    current_user: CurrentUser,
):
    """Pause a subscription — excluded from fan-out until resumed."""
    try:
        sub = await service.pause_subscription(
            db, str(current_user.id), subscription_id
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SuccessResponse(data=SubscriptionResponse.from_orm(sub))


@router.post(
    "/subscriptions/{subscription_id}/resume",
    response_model=SuccessResponse[SubscriptionResponse],
)
async def resume_subscription(
    subscription_id: str,
    db: DbSession,
    current_user: CurrentUser,
):
    """Resume a paused subscription."""
    try:
        sub = await service.resume_subscription(
            db, str(current_user.id), subscription_id
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SuccessResponse(data=SubscriptionResponse.from_orm(sub))


@router.delete(
    "/subscriptions/{subscription_id}",
    response_model=SuccessResponse[SubscriptionResponse],
)
async def stop_subscription(
    subscription_id: str,
    db: DbSession,
    current_user: CurrentUser,
):
    """Permanently stop a subscription."""
    try:
        sub = await service.stop_subscription(
            db, str(current_user.id), subscription_id
        )
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SuccessResponse(data=SubscriptionResponse.from_orm(sub))


@router.get(
    "/subscriptions/{subscription_id}/executions",
    response_model=SuccessResponse[list[SubscriberExecutionResponse]],
)
async def get_subscription_executions(
    subscription_id: str,
    db: DbSession,
    current_user: CurrentUser,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Execution history for a subscription."""
    try:
        executions = await service.get_subscription_executions(
            db, str(current_user.id), subscription_id, limit=limit, offset=offset
        )
    except PermissionError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse(
        data=[SubscriberExecutionResponse.from_orm(e) for e in executions]
    )


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — Strategy management
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/admin/strategies",
    response_model=SuccessResponse[list[InfluencerStrategyAdminResponse]],
)
async def admin_list_strategies(db: DbSession, current_admin: CurrentAdmin):
    """Admin: list all strategies (all statuses)."""
    strategies = await service.get_all_strategies_admin(db)
    return SuccessResponse(
        data=[
            InfluencerStrategyAdminResponse.from_orm_admin(
                s, webhook_url=_webhook_url(str(s.id))
            )
            for s in strategies
        ]
    )


@router.post(
    "/admin/strategies",
    response_model=SuccessResponse[RotateSecretResponse],
    status_code=status.HTTP_201_CREATED,
)
async def admin_create_strategy(
    data: InfluencerStrategyCreate,
    db: DbSession,
    current_admin: CurrentAdmin,
):
    """
    Admin: create a new strategy.
    Returns plain_secret ONCE — store it immediately.
    """
    try:
        strategy, plain_secret = await service.create_strategy(
            db, data, str(current_admin.id)
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return SuccessResponse(
        data=RotateSecretResponse(
            plain_secret=plain_secret,
            strategy_id=str(strategy.id),
            webhook_url=_webhook_url(str(strategy.id)),
        )
    )


@router.get(
    "/admin/strategies/{strategy_id}",
    response_model=SuccessResponse[InfluencerStrategyAdminResponse],
)
async def admin_get_strategy(
    strategy_id: str,
    db: DbSession,
    current_admin: CurrentAdmin,
):
    """Admin: get strategy detail including pine_code."""
    try:
        strategy = await service.get_strategy_admin(db, strategy_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse(
        data=InfluencerStrategyAdminResponse.from_orm_admin(
            strategy, webhook_url=_webhook_url(strategy_id)
        )
    )


@router.patch(
    "/admin/strategies/{strategy_id}",
    response_model=SuccessResponse[InfluencerStrategyAdminResponse],
)
async def admin_update_strategy(
    strategy_id: str,
    data: InfluencerStrategyUpdate,
    db: DbSession,
    current_admin: CurrentAdmin,
):
    """Admin: update strategy metadata, pine_code, or status."""
    try:
        strategy = await service.update_strategy(db, strategy_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SuccessResponse(
        data=InfluencerStrategyAdminResponse.from_orm_admin(
            strategy, webhook_url=_webhook_url(strategy_id)
        )
    )


@router.post(
    "/admin/strategies/{strategy_id}/archive",
    response_model=SuccessResponse[InfluencerStrategyAdminResponse],
)
async def admin_archive_strategy(
    strategy_id: str,
    db: DbSession,
    current_admin: CurrentAdmin,
):
    """Admin: archive a strategy (hides from marketplace)."""
    try:
        strategy = await service.archive_strategy(db, strategy_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SuccessResponse(
        data=InfluencerStrategyAdminResponse.from_orm_admin(strategy)
    )


@router.post(
    "/admin/strategies/{strategy_id}/rotate-secret",
    response_model=SuccessResponse[RotateSecretResponse],
)
async def admin_rotate_secret(
    strategy_id: str,
    db: DbSession,
    current_admin: CurrentAdmin,
):
    """
    Admin: rotate webhook secret. New secret shown ONCE.
    Old secret is immediately invalidated.
    """
    try:
        strategy, plain = await service.rotate_secret(db, strategy_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse(
        data=RotateSecretResponse(
            plain_secret=plain,
            strategy_id=str(strategy.id),
            webhook_url=_webhook_url(str(strategy.id)),
        )
    )


@router.get(
    "/admin/strategies/{strategy_id}/signals",
    response_model=SuccessResponse[list[InfluencerSignalResponse]],
)
async def admin_get_signals(
    strategy_id: str,
    db: DbSession,
    current_admin: CurrentAdmin,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
):
    """Admin: signal history for a strategy."""
    try:
        signals = await service.get_strategy_signals_admin(
            db, strategy_id, limit=limit, offset=offset
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse(
        data=[InfluencerSignalResponse.from_orm(s) for s in signals]
    )


@router.get(
    "/admin/strategies/{strategy_id}/subscribers",
    response_model=SuccessResponse[list[AdminSubscriberRow]],
)
async def admin_get_subscribers(
    strategy_id: str,
    db: DbSession,
    current_admin: CurrentAdmin,
):
    """Admin: list all subscribers for a strategy."""
    try:
        rows = await service.get_admin_subscribers(db, strategy_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return SuccessResponse(data=rows)


@router.post(
    "/admin/test-signal",
    response_model=SuccessResponse[TestSignalResponse],
)
async def admin_send_test_signal(
    data: TestSignalRequest,
    db: DbSession,
    current_admin: CurrentAdmin,
):
    """
    Admin: send a test signal (always DRY_RUN).

    Each click generates a fresh signal_id — no dedup collision.
    Supports iterative test-fix-retest cycles without code changes.
    Poll GET /admin/strategies/{id}/signals to see result.
    """
    redis = await get_redis_client()
    try:
        result = await signal_service.send_test_signal(data, db, redis)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return SuccessResponse(data=result)


# ── Internal helpers ──────────────────────────────────────────────────────────


def _webhook_url(strategy_id: str) -> str:
    return f"https://algofin-api.onrender.com/api/v1/webhooks/inf/{strategy_id}"
