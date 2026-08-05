# app/influencer/fanout_worker.py
# Phase INF: Influencer Fan-out Worker
#
# Asyncio background task — dequeues from algofin:inf_queue and fans out
# each signal to all active subscribers.
#
# Fan-out pipeline per subscriber:
#   1. Load mark price from Redis (algofin:mark:{symbol})
#   2. Compute quantity via quantity.py (normalize_quantity)
#   3. Map action → Binance side + reduce_only
#   4. Evaluate risk rules
#   5. DRY_RUN: write InfluencerSubscriberExecution (no order)
#      LIVE: place_order + write execution
#   6. UNIQUE(signal_id, subscription_id) prevents double-write on retry
#
# Worker lifecycle:
#   start_influencer_worker() → registered at app startup (app/main.py)
#   stop_influencer_worker()  → called on app shutdown
#
# Paused/stopped subscriptions are NEVER loaded — query uses status='active'.

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database import AsyncSessionLocal, get_redis_client
from app.influencer.quantity import QuantityError, get_symbol_filters, normalize_quantity
from app.models.influencer import (
    InfluencerSignal,
    InfluencerSubscription,
    InfluencerSubscriberExecution,
)

logger = logging.getLogger(__name__)

# Redis keys
_INF_QUEUE_KEY = "algofin:inf_queue"
_INF_RETRY_KEY = "algofin:inf_retry"
_MARK_PRICE_PREFIX = "algofin:mark:"
_HEARTBEAT_KEY = "algofin:inf_worker:heartbeat"
_HEARTBEAT_TTL = 120  # seconds

# Concurrency: max parallel subscriber executions per signal
_FAN_OUT_SEMAPHORE = 20

_running = False
_task: asyncio.Task | None = None


# ── Action → Binance side / reduce_only ──────────────────────────────────────

_ACTION_MAP = {
    "ENTER_LONG":  ("BUY",  False),
    "EXIT_LONG":   ("SELL", True),
    "ENTER_SHORT": ("SELL", False),
    "EXIT_SHORT":  ("BUY",  True),
}


# ── Worker lifecycle ──────────────────────────────────────────────────────────


def start_influencer_worker() -> None:
    global _running, _task
    _running = True
    _task = asyncio.create_task(_worker_loop(), name="influencer_fanout_worker")
    logger.info("[InfWorker] Started")


async def stop_influencer_worker() -> None:
    global _running, _task
    _running = False
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
    logger.info("[InfWorker] Stopped")


# ── Main worker loop ──────────────────────────────────────────────────────────


async def _worker_loop() -> None:
    redis = await get_redis_client()

    while _running:
        try:
            # Heartbeat
            await redis.setex(_HEARTBEAT_KEY, _HEARTBEAT_TTL, "1")

            # Poll retry queue — re-enqueue ready signals
            await _poll_retry_queue(redis)

            # BRPOP with 5s timeout
            raw = await redis.brpop(_INF_QUEUE_KEY, timeout=5)
            if not raw:
                continue

            _, message_json = raw
            message = json.loads(message_json)
            signal_id = message.get("signal_id")
            if not signal_id:
                continue

            await _process_signal(signal_id, redis)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.exception(f"[InfWorker] Unhandled error in loop: {exc}")
            await asyncio.sleep(1)


# ── Signal processing ─────────────────────────────────────────────────────────


async def _process_signal(signal_id: str, redis) -> None:
    async with AsyncSessionLocal() as db:
        # Load signal
        result = await db.execute(
            select(InfluencerSignal).where(
                InfluencerSignal.id == uuid.UUID(signal_id)
            )
        )
        signal = result.scalar_one_or_none()
        if signal is None:
            logger.warning(f"[InfWorker] Signal not found: {signal_id}")
            return

        if signal.status not in ("QUEUED", "FANNING_OUT"):
            logger.info(f"[InfWorker] Signal already processed: {signal_id} ({signal.status})")
            return

        # Mark FANNING_OUT
        signal.status = "FANNING_OUT"
        await db.commit()

        # Load ONLY active subscriptions for this strategy
        subs_result = await db.execute(
            select(InfluencerSubscription).where(
                InfluencerSubscription.influencer_strategy_id == signal.influencer_strategy_id,
                InfluencerSubscription.status == "active",  # paused/stopped never loaded
            )
        )
        subscriptions = list(subs_result.scalars().all())

        if not subscriptions:
            signal.status = "COMPLETED"
            signal.subscriber_count = 0
            signal.completed_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info(f"[InfWorker] Signal {signal_id}: no active subscribers")
            return

        # Fan out concurrently with semaphore
        semaphore = asyncio.Semaphore(_FAN_OUT_SEMAPHORE)
        tasks = [
            _execute_for_subscriber(signal, sub, redis, semaphore)
            for sub in subscriptions
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Count successful executions (non-exception results)
        completed = sum(1 for r in results if not isinstance(r, Exception))

        signal.status = "COMPLETED"
        signal.subscriber_count = len(subscriptions)
        signal.completed_at = datetime.now(timezone.utc)
        await db.commit()

        logger.info(
            f"[InfWorker] Signal {signal_id} completed: "
            f"{completed}/{len(subscriptions)} subscribers processed"
        )


# ── Per-subscriber execution ──────────────────────────────────────────────────


async def _execute_for_subscriber(
    signal: InfluencerSignal,
    sub: InfluencerSubscription,
    redis,
    semaphore: asyncio.Semaphore,
) -> None:
    """
    Execute signal for one subscriber. Errors are caught and written
    to InfluencerSubscriberExecution — never bubble up to cancel others.
    """
    async with semaphore:
        t_start = time.monotonic()

        async with AsyncSessionLocal() as db:
            try:
                await _do_execute(signal, sub, redis, db)
            except IntegrityError:
                # UNIQUE(signal_id, subscription_id) — already processed
                await db.rollback()
                logger.info(
                    f"[InfWorker] Duplicate execution skipped: "
                    f"signal={signal.id} sub={sub.id}"
                )
            except Exception as exc:
                await db.rollback()
                latency = int((time.monotonic() - t_start) * 1000)
                logger.exception(
                    f"[InfWorker] Execution failed for sub={sub.id}: {exc}"
                )
                # Write FAILED execution record
                try:
                    async with AsyncSessionLocal() as db2:
                        execution = InfluencerSubscriberExecution(
                            signal_id=signal.id,
                            subscription_id=sub.id,
                            user_id=sub.user_id,
                            action=signal.action,
                            symbol=sub.symbol,
                            execution_mode=signal.execution_mode,
                            computed_quantity=None,
                            risk_result=None,
                            order_id=None,
                            status="FAILED",
                            error=str(exc)[:500],
                            execution_latency_ms=latency,
                        )
                        db2.add(execution)
                        await db2.commit()
                except IntegrityError:
                    pass  # duplicate guard


async def _do_execute(
    signal: InfluencerSignal,
    sub: InfluencerSubscription,
    redis,
    db,
) -> None:
    t_start = time.monotonic()

    # ── Step 1: Mark price ────────────────────────────────────────────────────
    mark_key = f"{_MARK_PRICE_PREFIX}{sub.symbol}"
    mark_raw = await redis.get(mark_key)
    if mark_raw is None:
        latency = int((time.monotonic() - t_start) * 1000)
        execution = InfluencerSubscriberExecution(
            signal_id=signal.id,
            subscription_id=sub.id,
            user_id=sub.user_id,
            action=signal.action,
            symbol=sub.symbol,
            execution_mode=signal.execution_mode,
            computed_quantity=None,
            risk_result=None,
            order_id=None,
            status="PRICE_UNAVAILABLE",
            error=f"Mark price missing from Redis key: {mark_key}",
            execution_latency_ms=latency,
        )
        db.add(execution)
        await db.commit()
        logger.warning(f"[InfWorker] Mark price unavailable for {sub.symbol}")
        return

    mark_price = Decimal(mark_raw.decode() if isinstance(mark_raw, bytes) else mark_raw)

    # ── Step 2: Quantity normalization ────────────────────────────────────────
    action = signal.action
    computed_quantity: Decimal | None = None

    if action in ("ENTER_LONG", "ENTER_SHORT"):
        raw_qty = sub.capital_usdt / mark_price
        try:
            filters = await get_symbol_filters(sub.symbol, redis)
            computed_quantity = normalize_quantity(raw_qty, mark_price, filters)
        except QuantityError as qe:
            # Map QuantityError to appropriate status
            if "QUANTITY_TOO_SMALL" in qe.reason:
                exec_status = "QUANTITY_TOO_SMALL"
            else:
                exec_status = "BELOW_MIN_NOTIONAL"

            latency = int((time.monotonic() - t_start) * 1000)
            execution = InfluencerSubscriberExecution(
                signal_id=signal.id,
                subscription_id=sub.id,
                user_id=sub.user_id,
                action=action,
                symbol=sub.symbol,
                execution_mode=signal.execution_mode,
                computed_quantity=None,
                risk_result=None,
                order_id=None,
                status=exec_status,
                error=qe.reason,
                execution_latency_ms=latency,
            )
            db.add(execution)
            await db.commit()
            logger.warning(f"[InfWorker] {exec_status} for sub={sub.id}: {qe.reason}")
            return

    else:
        # EXIT signals: DRY_RUN placeholder (same formula)
        # INF+1: source from open position / Pine payload
        raw_qty = sub.capital_usdt / mark_price
        try:
            filters = await get_symbol_filters(sub.symbol, redis)
            computed_quantity = normalize_quantity(raw_qty, mark_price, filters)
        except QuantityError:
            computed_quantity = None  # EXIT with no quantity — log only, don't block

    # ── Step 3: Map action → side + reduce_only ───────────────────────────────
    side, reduce_only = _ACTION_MAP[action]

    # ── Step 4: Risk rules ────────────────────────────────────────────────────
    risk_result = "PASS"
    risk_rule_id = None
    try:
        from app.database import get_redis_client as _grc
        from app.orders.schemas import PlaceOrderRequest
        from app.risk.engine import RiskViolationError, evaluate_rules
        from app.models.exchange import UserExchangeAccount
        from sqlalchemy import select as sa_select

        acct_result = await db.execute(
            sa_select(UserExchangeAccount.id).where(
                UserExchangeAccount.user_id == sub.user_id,
                UserExchangeAccount.is_active == True,  # noqa: E712
            )
        )
        all_account_ids = [str(r) for r in acct_result.scalars().all()]

        risk_req = PlaceOrderRequest(
            exchange_account_id=sub.exchange_account_id,
            symbol=sub.symbol,
            side=side,
            order_type="MARKET",
            quantity=computed_quantity or Decimal("0"),
            reduce_only=reduce_only,
        )
        await evaluate_rules(
            db,
            user_id=str(sub.user_id),
            req=risk_req,
            account_ids=all_account_ids,
            redis_client=redis,
        )
    except Exception as exc:
        from app.risk.engine import RiskViolationError
        if isinstance(exc, RiskViolationError):
            risk_result = "BLOCK"
            logger.info(f"[InfWorker] Risk blocked sub={sub.id}: {exc}")
        else:
            logger.warning(f"[InfWorker] Risk check error for sub={sub.id}: {exc}")
            # Non-fatal: treat as PASS if risk engine is temporarily unavailable

    # ── Step 5: Execute ───────────────────────────────────────────────────────
    order_id = None
    latency = int((time.monotonic() - t_start) * 1000)

    if signal.execution_mode == "DRY_RUN":
        # DRY_RUN: write execution record, no order
        exec_status = "DRY_RUN_OK"
        execution = InfluencerSubscriberExecution(
            signal_id=signal.id,
            subscription_id=sub.id,
            user_id=sub.user_id,
            action=action,
            symbol=sub.symbol,
            execution_mode="DRY_RUN",
            computed_quantity=computed_quantity,
            risk_result=risk_result,
            risk_rule_id=risk_rule_id,
            order_id=None,
            status=exec_status,
            error=None,
            execution_latency_ms=latency,
        )
        db.add(execution)
        await db.commit()
        logger.info(
            f"[InfWorker] DRY_RUN_OK sub={sub.id} "
            f"qty={computed_quantity} risk={risk_result} latency={latency}ms"
        )

    elif signal.execution_mode == "LIVE":
        if risk_result == "BLOCK":
            execution = InfluencerSubscriberExecution(
                signal_id=signal.id,
                subscription_id=sub.id,
                user_id=sub.user_id,
                action=action,
                symbol=sub.symbol,
                execution_mode="LIVE",
                computed_quantity=computed_quantity,
                risk_result="BLOCK",
                risk_rule_id=risk_rule_id,
                order_id=None,
                status="RISK_BLOCKED",
                error=None,
                execution_latency_ms=latency,
            )
            db.add(execution)
            await db.commit()
            return

        # Place real order
        try:
            from app.orders.schemas import PlaceOrderRequest
            from app.orders.service import place_order

            order_req = PlaceOrderRequest(
                exchange_account_id=sub.exchange_account_id,
                symbol=sub.symbol,
                side=side,
                order_type="MARKET",
                quantity=computed_quantity or Decimal("0"),
                reduce_only=reduce_only,
            )
            order = await place_order(db, user_id=str(sub.user_id), req=order_req)
            order_id = order.id
            exec_status = "ORDER_SUBMITTED"
        except Exception as exc:
            exec_status = "FAILED"
            error_msg = str(exc)[:500]
            latency = int((time.monotonic() - t_start) * 1000)
            execution = InfluencerSubscriberExecution(
                signal_id=signal.id,
                subscription_id=sub.id,
                user_id=sub.user_id,
                action=action,
                symbol=sub.symbol,
                execution_mode="LIVE",
                computed_quantity=computed_quantity,
                risk_result=risk_result,
                order_id=None,
                status=exec_status,
                error=error_msg,
                execution_latency_ms=latency,
            )
            db.add(execution)
            await db.commit()
            return

        latency = int((time.monotonic() - t_start) * 1000)
        execution = InfluencerSubscriberExecution(
            signal_id=signal.id,
            subscription_id=sub.id,
            user_id=sub.user_id,
            action=action,
            symbol=sub.symbol,
            execution_mode="LIVE",
            computed_quantity=computed_quantity,
            risk_result=risk_result,
            order_id=order_id,
            status=exec_status,
            error=None,
            execution_latency_ms=latency,
        )
        db.add(execution)
        await db.commit()
        logger.info(
            f"[InfWorker] ORDER_SUBMITTED sub={sub.id} "
            f"order={order_id} latency={latency}ms"
        )


# ── Retry queue ───────────────────────────────────────────────────────────────


async def _poll_retry_queue(redis) -> None:
    """Re-enqueue signals that are past their retry-at timestamp."""
    now = time.time()
    ready = await redis.zrangebyscore(_INF_RETRY_KEY, 0, now)
    for item in ready:
        await redis.lpush(_INF_QUEUE_KEY, item)
        await redis.zrem(_INF_RETRY_KEY, item)
