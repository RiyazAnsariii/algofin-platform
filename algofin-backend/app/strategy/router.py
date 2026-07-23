# app/strategy/router.py
# AlgoFin v2 — Phase F: Strategy Engine REST API
#
# GET    /strategy              — list user's strategies
# POST   /strategy              — create strategy
# GET    /strategy/{id}         — get single strategy
# PATCH  /strategy/{id}         — update (name / description / status)
# DELETE /strategy/{id}         — delete strategy
# POST   /strategy/{id}/trigger — manually trigger a strategy (manual type)
# GET    /strategy/{id}/history — execution log for a strategy

import uuid as _uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, desc

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.models.strategy import Strategy, StrategyExecution
from app.strategy.schemas import (
    StrategyCreate,
    StrategyExecutionResponse,
    StrategyResponse,
    StrategyUpdate,
    PineWebhookCreate,
    PineWebhookResponse,
    WebhookSecretResponse,
    SavePineRequest,
    PineVersionResponse,
    SignalHistoryResponse,
    ExecutionHistoryResponse,
)
from app.strategy.service import StrategyService, DomainError
from app.webhooks.secret_service import SecretService
from app.webhooks.version_service import VersionService
from app.adapters.postgres_signal_repo import (
    PostgresSignalRepository,
    PostgresExecutionRepository,
)

router = APIRouter(prefix="/strategy", tags=["strategy"])


# ── List ───────────────────────────────────────────────────────────────────


@router.get("", response_model=SuccessResponse[list[StrategyResponse]])
async def list_strategies(
    current_user: CurrentUser,
    db: DbSession,
    status_filter: str | None = None,
) -> SuccessResponse:
    q = select(Strategy).where(Strategy.user_id == str(current_user.id))
    if status_filter:
        q = q.where(Strategy.status == status_filter)
    q = q.order_by(desc(Strategy.created_at))
    result = await db.execute(q)
    strategies = result.scalars().all()
    return SuccessResponse(data=[StrategyResponse.from_orm_obj(s) for s in strategies])


# ── Create ─────────────────────────────────────────────────────────────────


@router.post("", response_model=SuccessResponse[StrategyResponse], status_code=201)
async def create_strategy(
    body: StrategyCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    # Verify the exchange account belongs to this user
    from app.models.exchange import UserExchangeAccount

    acct_result = await db.execute(
        select(UserExchangeAccount).where(
            UserExchangeAccount.id == body.exchange_account_id,
            UserExchangeAccount.user_id == str(current_user.id),
            UserExchangeAccount.is_active == True,  # noqa: E712
        )
    )
    if not acct_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Exchange account not found or not active",
        )

    s = Strategy(
        user_id=str(current_user.id),
        exchange_account_id=body.exchange_account_id,
        name=body.name,
        description=body.description,
        strategy_type=body.strategy_type,
        status="active",
        symbol=body.symbol,
        order_side=body.order_side,
        order_type=body.order_type,
        quantity=body.quantity,
        limit_price=body.limit_price,
        reduce_only=body.reduce_only,
        price_level=body.price_level,
        direction=body.direction,
        max_executions=body.max_executions,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return SuccessResponse(data=StrategyResponse.from_orm_obj(s))


# ── Get single ─────────────────────────────────────────────────────────────


@router.get("/{strategy_id}", response_model=SuccessResponse[StrategyResponse])
async def get_strategy(
    strategy_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == str(current_user.id),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return SuccessResponse(data=StrategyResponse.from_orm_obj(s))


# ── Update ─────────────────────────────────────────────────────────────────


@router.patch("/{strategy_id}", response_model=SuccessResponse[StrategyResponse])
async def update_strategy(
    strategy_id: str,
    body: StrategyUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == str(current_user.id),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")

    if body.name is not None:
        s.name = body.name.strip()
    if body.description is not None:
        s.description = body.description
    if body.status is not None:
        s.status = body.status

    await db.commit()
    await db.refresh(s)
    return SuccessResponse(data=StrategyResponse.from_orm_obj(s))


# ── Delete ─────────────────────────────────────────────────────────────────


@router.delete("/{strategy_id}", response_model=SuccessResponse[dict])
async def delete_strategy(
    strategy_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == str(current_user.id),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    await db.delete(s)
    await db.commit()
    return SuccessResponse(data={"deleted": True})


# ── Manual trigger ─────────────────────────────────────────────────────────


@router.post(
    "/{strategy_id}/trigger", response_model=SuccessResponse[StrategyExecutionResponse]
)
async def trigger_strategy(
    strategy_id: str,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    """Manually trigger a strategy (any type). Places the order immediately."""
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == str(current_user.id),
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if s.status == "stopped":
        raise HTTPException(
            status_code=400,
            detail="Strategy is stopped. Re-activate it before triggering.",
        )

    from app.strategy.engine import _execute_strategy

    await _execute_strategy(s, trigger_price=None)

    # Return latest execution record
    exec_result = await db.execute(
        select(StrategyExecution)
        .where(StrategyExecution.strategy_id == s.id)
        .order_by(desc(StrategyExecution.executed_at))
        .limit(1)
    )
    execution = exec_result.scalar_one_or_none()
    if not execution:
        raise HTTPException(status_code=500, detail="Execution record not found")

    return SuccessResponse(data=StrategyExecutionResponse.from_orm_obj(execution))


# ── Execution history ──────────────────────────────────────────────────────


@router.get(
    "/{strategy_id}/history",
    response_model=SuccessResponse[list[StrategyExecutionResponse]],
)
async def get_execution_history(
    strategy_id: str,
    current_user: CurrentUser,
    db: DbSession,
    limit: int = 50,
) -> SuccessResponse:
    # Verify ownership
    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id,
            Strategy.user_id == str(current_user.id),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Strategy not found")

    limit = min(limit, 200)
    exec_result = await db.execute(
        select(StrategyExecution)
        .where(StrategyExecution.strategy_id == strategy_id)
        .order_by(desc(StrategyExecution.executed_at))
        .limit(limit)
    )
    executions = exec_result.scalars().all()
    return SuccessResponse(
        data=[StrategyExecutionResponse.from_orm_obj(e) for e in executions]
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Phase M: pine_webhook lifecycle endpoints
# ═══════════════════════════════════════════════════════════════════════════════


def _webhook_url(strategy_id: str) -> str:
    return f"https://algofin-api.onrender.com/api/v1/webhooks/tv/{strategy_id}"


@router.post(
    "/pine",
    response_model=SuccessResponse[PineWebhookResponse],
    status_code=201,
    summary="Create pine_webhook strategy (DRAFT)",
)
async def create_pine_webhook_strategy(
    body: PineWebhookCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse:
    from app.models.exchange import UserExchangeAccount
    from app.models.strategy import Strategy

    acct = await db.execute(
        select(UserExchangeAccount).where(
            UserExchangeAccount.id == body.exchange_account_id,
            UserExchangeAccount.user_id == str(current_user.id),
            UserExchangeAccount.is_active.is_(True),
        )
    )
    if not acct.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="Exchange account not found or not active"
        )
    s = Strategy(
        user_id=current_user.id,
        exchange_account_id=_uuid.UUID(body.exchange_account_id),
        strategy_type="pine_webhook",
        status="draft",
        name=body.name,
        description=body.description,
        symbol=body.symbol,
        timeframe=body.timeframe,
        quantity=body.quantity,
        reduce_only=body.reduce_only,
        max_executions=body.max_executions,
        is_test_mode=False,
        current_version=0,
        execution_count=0,
        order_type="MARKET",
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return SuccessResponse(
        data=PineWebhookResponse.from_orm_obj(s, webhook_url=_webhook_url(str(s.id)))
    )


@router.post(
    "/{strategy_id}/publish", response_model=SuccessResponse[WebhookSecretResponse]
)
async def publish_strategy(
    strategy_id: str, current_user: CurrentUser, db: DbSession
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if s.strategy_type != "pine_webhook":
        raise HTTPException(
            status_code=400, detail="Only pine_webhook strategies use this endpoint"
        )
    try:
        await StrategyService(db).publish(s, actor_id=current_user.id)
    except DomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    plain = await SecretService(db).generate(s.id)
    await db.commit()
    return SuccessResponse(
        data=WebhookSecretResponse(
            secret=plain, strategy_id=strategy_id, webhook_url=_webhook_url(strategy_id)
        )
    )


@router.post(
    "/{strategy_id}/pause", response_model=SuccessResponse[PineWebhookResponse]
)
async def pause_strategy(
    strategy_id: str, current_user: CurrentUser, db: DbSession
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    try:
        await StrategyService(db).transition(s, "paused")
    except DomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
    await db.refresh(s)
    return SuccessResponse(
        data=PineWebhookResponse.from_orm_obj(s, webhook_url=_webhook_url(strategy_id))
    )


@router.post(
    "/{strategy_id}/resume", response_model=SuccessResponse[PineWebhookResponse]
)
async def resume_strategy(
    strategy_id: str, current_user: CurrentUser, db: DbSession
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    try:
        await StrategyService(db).transition(s, "active")
    except DomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
    await db.refresh(s)
    return SuccessResponse(
        data=PineWebhookResponse.from_orm_obj(s, webhook_url=_webhook_url(strategy_id))
    )


@router.post("/{strategy_id}/stop", response_model=SuccessResponse[PineWebhookResponse])
async def stop_strategy(
    strategy_id: str, current_user: CurrentUser, db: DbSession
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    try:
        await StrategyService(db).transition(s, "stopped")
    except DomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
    await db.refresh(s)
    return SuccessResponse(
        data=PineWebhookResponse.from_orm_obj(s, webhook_url=_webhook_url(strategy_id))
    )


@router.post(
    "/{strategy_id}/archive", response_model=SuccessResponse[PineWebhookResponse]
)
async def archive_strategy(
    strategy_id: str, current_user: CurrentUser, db: DbSession
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    try:
        await StrategyService(db).transition(s, "archived")
    except DomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await SecretService(db).revoke_all(s.id)
    await db.commit()
    await db.refresh(s)
    return SuccessResponse(data=PineWebhookResponse.from_orm_obj(s))


@router.post(
    "/{strategy_id}/rotate-secret",
    response_model=SuccessResponse[WebhookSecretResponse],
)
async def rotate_secret(
    strategy_id: str, current_user: CurrentUser, db: DbSession
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if s.status == "archived":
        raise HTTPException(
            status_code=400, detail="Cannot rotate secret of archived strategy"
        )
    new_secret = await SecretService(db).rotate(s.id)
    await db.commit()
    return SuccessResponse(
        data=WebhookSecretResponse(
            secret=new_secret,
            strategy_id=strategy_id,
            webhook_url=_webhook_url(strategy_id),
        )
    )


@router.post(
    "/{strategy_id}/pine",
    response_model=SuccessResponse[PineVersionResponse],
    status_code=201,
)
async def save_pine_version(
    strategy_id: str, body: SavePineRequest, current_user: CurrentUser, db: DbSession
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    if s.status == "archived":
        raise HTTPException(
            status_code=400, detail="Cannot save Pine code to archived strategy"
        )
    try:
        version = await VersionService(db).save_version(s, body.pine_code)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
    await db.refresh(version)
    return SuccessResponse(data=PineVersionResponse.from_orm_obj(version))


@router.get(
    "/{strategy_id}/pine", response_model=SuccessResponse[list[PineVersionResponse]]
)
async def list_pine_versions(
    strategy_id: str, current_user: CurrentUser, db: DbSession
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Strategy not found")
    versions = await VersionService(db).list_versions(strategy_id)
    return SuccessResponse(data=[PineVersionResponse.from_orm_obj(v) for v in versions])


@router.get(
    "/{strategy_id}/signals",
    response_model=SuccessResponse[list[SignalHistoryResponse]],
)
async def list_signals(
    strategy_id: str,
    current_user: CurrentUser,
    db: DbSession,
    limit: int = 50,
    offset: int = 0,
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Strategy not found")
    signals = await PostgresSignalRepository(db).list_by_strategy(
        _uuid.UUID(strategy_id), current_user.id, limit=min(limit, 200), offset=offset
    )
    return SuccessResponse(
        data=[SignalHistoryResponse.from_orm_obj(s) for s in signals]
    )


@router.get(
    "/{strategy_id}/executions",
    response_model=SuccessResponse[list[ExecutionHistoryResponse]],
)
async def list_webhook_executions(
    strategy_id: str, current_user: CurrentUser, db: DbSession, limit: int = 50
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Strategy not found")
    records = await PostgresExecutionRepository(db).list_by_strategy(
        _uuid.UUID(strategy_id), current_user.id, limit=min(limit, 200)
    )
    return SuccessResponse(
        data=[ExecutionHistoryResponse.from_orm_obj(e) for e in records]
    )


@router.patch(
    "/{strategy_id}/test-mode", response_model=SuccessResponse[PineWebhookResponse]
)
async def set_test_mode(
    strategy_id: str, current_user: CurrentUser, db: DbSession, enabled: bool = True
) -> SuccessResponse:
    from app.models.strategy import Strategy

    result = await db.execute(
        select(Strategy).where(
            Strategy.id == strategy_id, Strategy.user_id == str(current_user.id)
        )
    )
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Strategy not found")
    try:
        await StrategyService(db).toggle_test_mode(s, enabled=enabled)
    except DomainError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
    await db.refresh(s)
    return SuccessResponse(
        data=PineWebhookResponse.from_orm_obj(s, webhook_url=_webhook_url(strategy_id))
    )
