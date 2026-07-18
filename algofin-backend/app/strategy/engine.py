# app/strategy/engine.py
# AlgoFin v2 — Phase F: Strategy Engine
#
# Background asyncio task:
#   1. Subscribes to Redis "algofin:price_updates" (MarketDataEvent JSON)
#   2. On each tick, evaluates all "active" price_breakout strategies for that symbol
#   3. If condition met → places order via the orders service → logs StrategyExecution
#   4. Pauses strategy if max_executions reached
#
# Manual strategies are triggered directly via the REST API (POST /strategy/{id}/trigger).

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.strategy import Strategy, StrategyExecution

logger = logging.getLogger(__name__)

_engine_task: asyncio.Task | None = None


# ── Order placement helper ─────────────────────────────────────────────────

async def _place_order(
    db: AsyncSession,
    strategy: Strategy,
    trigger_price: Decimal | None,
) -> tuple[str, str | None]:
    """
    Place an order using the existing orders service.
    Returns (status, order_id | None).
    """
    try:
        from app.orders.service import place_order   # avoid circular at module level
        from app.orders.schemas import PlaceOrderRequest

        req = PlaceOrderRequest(
            exchange_account_id=str(strategy.exchange_account_id),
            symbol=strategy.symbol,
            side=strategy.order_side,
            order_type=strategy.order_type,
            quantity=strategy.quantity,
            price=strategy.limit_price,
            reduce_only=strategy.reduce_only,
        )
        order = await place_order(db, user_id=strategy.user_id, req=req)
        return "order_placed", str(order.id)
    except Exception as exc:
        logger.error("[StrategyEngine] Order placement failed for %s: %s", strategy.name, exc)
        return "failed", None


# ── Execution handler ──────────────────────────────────────────────────────

async def _execute_strategy(strategy: Strategy, trigger_price: Decimal | None) -> None:
    """Execute one strategy: place order + log + update counters."""
    async with AsyncSessionLocal() as db:
        # Re-load inside this session (fresh state)
        result = await db.execute(select(Strategy).where(Strategy.id == strategy.id))
        s = result.scalar_one_or_none()
        if s is None or s.status != "active":
            return   # was deactivated between check and execution

        exec_status, order_id = await _place_order(db, s, trigger_price)

        # Log execution
        execution = StrategyExecution(
            strategy_id=s.id,
            user_id=s.user_id,
            trigger_price=trigger_price,
            order_id=uuid.UUID(order_id) if order_id else None,
            status=exec_status,
        )
        db.add(execution)

        # Update counters
        s.execution_count += 1
        s.last_executed_at = datetime.now(timezone.utc)

        # Stop if max executions reached
        if s.max_executions is not None and s.execution_count >= s.max_executions:
            s.status = "stopped"
            logger.info("[StrategyEngine] Strategy %s reached max executions, stopped.", s.name)

        await db.commit()

        logger.info(
            "[StrategyEngine] Strategy '%s' executed — status=%s order=%s",
            s.name, exec_status, order_id
        )


# ── Price update evaluator ─────────────────────────────────────────────────

# Tracks which strategies already fired to prevent re-firing on same side.
# Key: strategy_id → last_direction_state ("above" | "below" | None)
_fired_state: dict[str, str | None] = {}


async def _evaluate_price_breakout(symbol: str, price: Decimal) -> None:
    """Check all active price_breakout strategies for this symbol."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Strategy).where(
                Strategy.strategy_type == "price_breakout",
                Strategy.symbol == symbol,
                Strategy.status == "active",
            )
        )
        strategies = result.scalars().all()

    for s in strategies:
        if s.price_level is None or s.direction is None:
            continue

        sid = str(s.id)
        level = Decimal(str(s.price_level))

        current_side = "above" if price >= level else "below"
        prev_side    = _fired_state.get(sid)

        # Edge-triggered: only fire when crossing (not every tick)
        if prev_side != current_side:
            _fired_state[sid] = current_side
            if current_side == s.direction:
                logger.info(
                    "[StrategyEngine] Strategy '%s' triggered: %s %s price_level=%s",
                    s.name, symbol, s.direction, level
                )
                await _execute_strategy(s, price)


# ── Redis subscriber loop ──────────────────────────────────────────────────

async def _run_engine() -> None:
    from app.database import get_redis_client as get_redis

    logger.info("[StrategyEngine] Starting...")
    try:
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe("algofin:price_updates")
        logger.info("[StrategyEngine] Subscribed to price_updates")

        async for raw in pubsub.listen():
            if raw["type"] != "message":
                continue
            try:
                data = raw.get("data") or b""
                if isinstance(data, bytes):
                    data = data.decode()
                event = json.loads(data)

                symbol       = event.get("symbol", "")
                price_raw    = event.get("price") or event.get("mark_price") or ""
                if not symbol or not price_raw:
                    continue
                price = Decimal(str(price_raw))

                await _evaluate_price_breakout(symbol, price)
            except Exception as exc:
                logger.error("[StrategyEngine] Error processing event: %s", exc)

    except asyncio.CancelledError:
        logger.info("[StrategyEngine] Stopped.")
    except Exception as exc:
        return exc   # bubble up to the retry wrapper


async def _run_engine_with_backoff() -> None:
    """
    Retry wrapper with exponential backoff.
    Upstash Redis (free tier) closes pub/sub connections immediately.
    After 5 consecutive failures we stop retrying to prevent log spam.
    The HTTP API continues to work regardless.
    """
    delay = 5
    max_delay = 60
    max_attempts = 5
    attempt = 0

    while attempt < max_attempts:
        exc = await _run_engine()
        if exc is None:
            return   # clean shutdown
        attempt += 1
        logger.warning(
            "[StrategyEngine] Connection failed (%s/%s): %s — retrying in %ss",
            attempt, max_attempts, exc, delay,
        )
        await asyncio.sleep(delay)
        delay = min(delay * 2, max_delay)

    logger.error(
        "[StrategyEngine] Pub/sub unavailable after %s attempts. "
        "Upstash free tier does not support persistent pub/sub. "
        "Engine disabled — HTTP API unaffected.",
        max_attempts,
    )


def start_strategy_engine() -> None:
    global _engine_task
    _engine_task = asyncio.ensure_future(_run_engine_with_backoff())
    logger.info("[StrategyEngine] Engine task created.")


def stop_strategy_engine() -> None:
    global _engine_task
    if _engine_task and not _engine_task.done():
        _engine_task.cancel()
        logger.info("[StrategyEngine] Engine task cancelled.")
