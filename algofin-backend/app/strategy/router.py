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

@router.post("/{strategy_id}/trigger", response_model=SuccessResponse[StrategyExecutionResponse])
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
            detail="Strategy is stopped. Re-activate it before triggering."
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

@router.get("/{strategy_id}/history", response_model=SuccessResponse[list[StrategyExecutionResponse]])
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
    return SuccessResponse(data=[StrategyExecutionResponse.from_orm_obj(e) for e in executions])
