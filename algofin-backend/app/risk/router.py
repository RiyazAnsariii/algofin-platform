# app/risk/router.py
# AlgoFin v2 — Phase D: Risk rules CRUD API
#
# POST   /risk/rules          — create rule
# GET    /risk/rules          — list all rules for user
# GET    /risk/rules/{id}     — get single rule
# PATCH  /risk/rules/{id}     — update rule (name, threshold, action, is_active, symbol)
# DELETE /risk/rules/{id}     — delete rule
# GET    /risk/violations     — list violation history

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.common.deps import CurrentUser, DbSession
from app.common.schemas import SuccessResponse
from app.models.risk import RiskRule, RiskViolation
from app.risk.schemas import CreateRuleRequest, RuleOut, UpdateRuleRequest, ViolationOut

router = APIRouter(prefix="/risk", tags=["Risk Controls"])


# ── POST /risk/rules — Create rule ────────────────────────────────────────────
@router.post("/rules", response_model=SuccessResponse[RuleOut], status_code=201)
async def create_rule(
    req: CreateRuleRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[RuleOut]:
    """Create a new risk rule. Rules are evaluated before every order placement."""
    rule = RiskRule(
        user_id=str(current_user.id),
        name=req.name,
        rule_type=req.rule_type,
        threshold=req.threshold,
        action=req.action,
        symbol=req.symbol.upper() if req.symbol else None,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return SuccessResponse(data=_out(rule))


# ── GET /risk/rules — List rules ──────────────────────────────────────────────
@router.get("/rules", response_model=SuccessResponse[list[RuleOut]])
async def list_rules(
    current_user: CurrentUser,
    db: DbSession,
    include_inactive: bool = Query(False),
) -> SuccessResponse[list[RuleOut]]:
    """List risk rules for the current user."""
    query = select(RiskRule).where(RiskRule.user_id == str(current_user.id))
    if not include_inactive:
        query = query.where(RiskRule.is_active == True)  # noqa: E712
    query = query.order_by(RiskRule.created_at)
    result = await db.execute(query)
    return SuccessResponse(data=[_out(r) for r in result.scalars().all()])


# ── GET /risk/rules/{id} — Get single rule ────────────────────────────────────
@router.get("/rules/{rule_id}", response_model=SuccessResponse[RuleOut])
async def get_rule(
    rule_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[RuleOut]:
    rule = await _get_owned_rule(db, rule_id=str(rule_id), user_id=str(current_user.id))
    return SuccessResponse(data=_out(rule))


# ── PATCH /risk/rules/{id} — Update rule ─────────────────────────────────────
@router.patch("/rules/{rule_id}", response_model=SuccessResponse[RuleOut])
async def update_rule(
    rule_id: UUID,
    req: UpdateRuleRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[RuleOut]:
    """Update rule fields. Use is_active=false to temporarily disable."""
    rule = await _get_owned_rule(db, rule_id=str(rule_id), user_id=str(current_user.id))
    if req.name      is not None: rule.name      = req.name
    if req.threshold is not None: rule.threshold = req.threshold
    if req.action    is not None: rule.action    = req.action
    if req.is_active is not None: rule.is_active = req.is_active
    if req.symbol    is not None: rule.symbol    = req.symbol.upper() if req.symbol else None
    await db.commit()
    await db.refresh(rule)
    return SuccessResponse(data=_out(rule))


# ── DELETE /risk/rules/{id} — Delete rule ────────────────────────────────────
@router.delete("/rules/{rule_id}", response_model=SuccessResponse[dict])
async def delete_rule(
    rule_id: UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> SuccessResponse[dict]:
    rule = await _get_owned_rule(db, rule_id=str(rule_id), user_id=str(current_user.id))
    await db.delete(rule)
    await db.commit()
    return SuccessResponse(data={"deleted": str(rule_id)})


# ── GET /risk/violations — Violation history ──────────────────────────────────
@router.get("/violations", response_model=SuccessResponse[list[ViolationOut]])
async def list_violations(
    current_user: CurrentUser,
    db: DbSession,
    limit: int = Query(50, ge=1, le=200),
) -> SuccessResponse[list[ViolationOut]]:
    """View the audit log of risk rule triggers, most recent first."""
    result = await db.execute(
        select(RiskViolation)
        .where(RiskViolation.user_id == str(current_user.id))
        .order_by(RiskViolation.occurred_at.desc())
        .limit(limit)
    )
    return SuccessResponse(data=[_vout(v) for v in result.scalars().all()])


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_owned_rule(db: DbSession, *, rule_id: str, user_id: str) -> RiskRule:
    result = await db.execute(
        select(RiskRule).where(
            RiskRule.id == rule_id,
            RiskRule.user_id == user_id,
        )
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Risk rule not found")
    return rule


def _out(rule: RiskRule) -> RuleOut:
    return RuleOut(
        id=rule.id,
        name=rule.name,
        rule_type=rule.rule_type,
        threshold=rule.threshold,
        action=rule.action,
        symbol=rule.symbol,
        is_active=rule.is_active,
        triggered_count=rule.triggered_count,
        last_triggered_at=rule.last_triggered_at.isoformat() if rule.last_triggered_at else None,
        created_at=rule.created_at.isoformat(),
    )


def _vout(v: RiskViolation) -> ViolationOut:
    return ViolationOut(
        id=v.id,
        rule_id=v.rule_id,
        rule_type=v.rule_type,
        threshold=v.threshold,
        current_value=v.current_value,
        action_taken=v.action_taken,
        symbol=v.symbol,
        note=v.note,
        occurred_at=v.occurred_at.isoformat(),
    )
