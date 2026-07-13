# app/risk/engine.py
# AlgoFin v2 — Phase D: Risk evaluation engine
#
# Called by orders/service.py BEFORE submitting an order to Binance.
# If any active rule triggers:
#   - action="reject" → raises RiskViolationError (order blocked)
#   - action="alert"  → allows the order, fires a RiskEvent to the frontend
#
# Risk events are published to Redis algofin:risk_events:<user_id>
# and relayed to the user's WebSocket session via ws_router.py.

from __future__ import annotations

import json
import logging
import time
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.risk import RiskRule, RiskViolation
from app.models.trading import Position, Trade
from app.marketdata.normalizer import RiskEvent, _next_seq

if TYPE_CHECKING:
    from app.orders.schemas import PlaceOrderRequest

logger = logging.getLogger(__name__)

RISK_EVENT_CHANNEL = "algofin:risk_events:{user_id}"


def risk_event_channel(user_id: str) -> str:
    return f"algofin:risk_events:{user_id}"


class RiskViolationError(Exception):
    """Raised when a risk rule blocks an order (action='reject')."""
    def __init__(self, rule: RiskRule, current_value: float) -> None:
        self.rule          = rule
        self.current_value = current_value
        super().__init__(
            f"Risk rule '{rule.name}' triggered: "
            f"{rule.rule_type} limit={rule.threshold} current={current_value:.4f}"
        )


async def evaluate_rules(
    db: AsyncSession,
    *,
    user_id: str,
    req: "PlaceOrderRequest",
    account_ids: list[str],
    redis_client,          # type: ignore[no-untyped-def]
) -> None:
    """
    Evaluate all active risk rules for the user before placing an order.

    Raises RiskViolationError if any reject-action rule triggers.
    Fires RiskEvent to Redis for alert-action rules.
    """
    # Load all active rules for this user (symbol-global first, then symbol-specific)
    result = await db.execute(
        select(RiskRule).where(
            RiskRule.user_id == user_id,
            RiskRule.is_active == True,  # noqa: E712
        ).order_by(RiskRule.created_at)
    )
    rules = list(result.scalars().all())
    if not rules:
        return

    symbol = req.symbol.upper()
    now    = datetime.now(timezone.utc)

    for rule in rules:
        # Skip symbol-scoped rules that don't apply to this order's symbol
        if rule.symbol and rule.symbol.upper() != symbol:
            continue

        current_value = await _evaluate_single_rule(
            db, rule=rule, user_id=user_id,
            account_ids=account_ids, req=req, symbol=symbol,
        )

        if current_value is None:
            continue   # rule type not applicable (e.g. no data yet)

        triggered = _check_threshold(rule.rule_type, current_value, float(rule.threshold))
        if not triggered:
            continue

        # ── Rule triggered ────────────────────────────────────────────────────
        violation = await _log_violation(
            db, rule=rule, user_id=user_id,
            current_value=current_value, symbol=symbol,
            action_taken="order_rejected" if rule.action == "reject" else "alert_sent",
        )

        # Publish RiskEvent to Redis
        await _publish_risk_event(
            redis_client,
            rule=rule,
            user_id=user_id,
            current_value=current_value,
            symbol=symbol,
            action_taken="order_rejected" if rule.action == "reject" else "alert_sent",
            violation_id=str(violation.id),
        )

        if rule.action == "reject":
            raise RiskViolationError(rule, current_value)
        # else: alert — continue; order will proceed


async def _evaluate_single_rule(
    db: AsyncSession,
    *,
    rule: RiskRule,
    user_id: str,
    account_ids: list[str],
    req: "PlaceOrderRequest",
    symbol: str,
) -> float | None:
    """Compute the current value relevant to the rule type."""

    if rule.rule_type == "MAX_DAILY_LOSS":
        return await _daily_realized_pnl(db, account_ids=account_ids)

    elif rule.rule_type == "MAX_POSITION_SIZE":
        return await _current_position_size(db, account_ids=account_ids, symbol=symbol, req=req)

    elif rule.rule_type == "MAX_OPEN_POSITIONS":
        return await _open_position_count(db, account_ids=account_ids)

    elif rule.rule_type == "MAX_ORDER_SIZE":
        return float(req.quantity)

    return None


def _check_threshold(rule_type: str, current: float, threshold: float) -> bool:
    """
    Returns True if the rule is breached.

    MAX_DAILY_LOSS:
        current is the realized PnL (negative = loss).
        Triggers when PnL < -threshold.
        e.g. threshold=500 triggers when PnL < -500.

    All others:
        Triggers when current >= threshold.
    """
    if rule_type == "MAX_DAILY_LOSS":
        return current < -abs(threshold)
    return current >= threshold


# ── Metric calculators ────────────────────────────────────────────────────────

async def _daily_realized_pnl(db: AsyncSession, *, account_ids: list[str]) -> float:
    """Sum today's realized_pnl from the trades table."""
    today = date.today()
    result = await db.execute(
        select(func.coalesce(func.sum(Trade.realized_pnl), 0)).where(
            Trade.exchange_account_id.in_(account_ids),
            func.date(Trade.trade_time) == today,
        )
    )
    value = result.scalar_one_or_none() or 0
    return float(value)


async def _current_position_size(
    db: AsyncSession,
    *,
    account_ids: list[str],
    symbol: str,
    req: "PlaceOrderRequest",
) -> float:
    """
    Current position size + the incoming order quantity.
    Ignores reduce_only orders (they close, not open).
    """
    if req.reduce_only:
        return 0.0   # reduce-only can never increase position

    result = await db.execute(
        select(func.coalesce(func.sum(Position.size), 0)).where(
            Position.exchange_account_id.in_(account_ids),
            Position.symbol == symbol,
        )
    )
    current = float(result.scalar_one_or_none() or 0)
    return current + float(req.quantity)


async def _open_position_count(db: AsyncSession, *, account_ids: list[str]) -> float:
    """Count of distinct open positions across all accounts."""
    result = await db.execute(
        select(func.count()).where(
            Position.exchange_account_id.in_(account_ids),
            Position.size > 0,
        )
    )
    return float(result.scalar_one_or_none() or 0)


# ── Violation log ─────────────────────────────────────────────────────────────

async def _log_violation(
    db: AsyncSession,
    *,
    rule: RiskRule,
    user_id: str,
    current_value: float,
    symbol: str,
    action_taken: str,
) -> RiskViolation:
    """Append a row to risk_violations and bump the rule's triggered_count."""
    violation = RiskViolation(
        rule_id=rule.id,
        user_id=user_id,
        rule_type=rule.rule_type,
        threshold=rule.threshold,
        current_value=Decimal(str(round(current_value, 8))),
        action_taken=action_taken,
        symbol=symbol or None,
        note=f"Triggered on order for {symbol}",
    )
    db.add(violation)

    # Update rule stats (non-fatal if this fails)
    rule.triggered_count += 1
    rule.last_triggered_at = datetime.now(timezone.utc)

    await db.flush()   # get violation.id before publishing event
    return violation


# ── Risk event publisher ──────────────────────────────────────────────────────

async def _publish_risk_event(
    redis_client,
    *,
    rule: RiskRule,
    user_id: str,
    current_value: float,
    symbol: str,
    action_taken: str,
    violation_id: str,
) -> None:
    event = RiskEvent(
        type="risk_event",
        version=1,
        sequence=_next_seq(f"risk_{user_id}"),
        exchange="binance",
        event_time=int(time.time() * 1000),
        rule_id=str(rule.id),
        rule_name=rule.name,
        rule_type=rule.rule_type,
        threshold=float(rule.threshold),
        current_value=current_value,
        action_taken=action_taken,
        symbol=symbol,
        user_id=user_id,
        violation_id=violation_id,
    )
    channel = risk_event_channel(user_id)
    try:
        await redis_client.publish(channel, json.dumps(event.to_dict()))
    except Exception as exc:
        logger.warning(f"[Risk] Failed to publish risk event: {exc}")
