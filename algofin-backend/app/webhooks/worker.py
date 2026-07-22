# app/webhooks/worker.py
# AlgoFin v2 — Phase M: Async webhook worker
#
# Runs as a background asyncio task (started in main.py startup event).
# Two loops:
#   1. Worker loop   — BRPOP from queue, process signal, set heartbeat
#   2. Reconcile loop — every 60s: re-queue stuck signals, expire grace secrets
#
# Architecture:
#   - Worker is single-instance (one asyncio task per process)
#   - Horizontal scaling: run multiple Uvicorn workers (each has its own worker loop)
#   - Concurrency safety: SELECT FOR UPDATE NOWAIT in ExecutionService
#
# Retry policy (from architecture Tier-2 constants):
#   Attempt 1: immediate (message already in queue)
#   Attempt 2: 1s delay  (ZADD to retry sorted set)
#   Attempt 3: 5s delay
#   Attempt 4: 30s delay → DLQ if still failing

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from app.config import settings
from app.database import AsyncSessionLocal, get_redis_client
from app.adapters.redis_queue import RedisQueueAdapter
from app.ports.queue import QueueMessage
from app.webhooks.execution_service import ExecutionService
from app.webhooks.signal_service import SignalStatus

logger = logging.getLogger(__name__)

# ── Global handles (set by start/stop functions called from main.py) ──────────
_worker_task: asyncio.Task | None = None
_reconcile_task: asyncio.Task | None = None


# ── Worker loop ───────────────────────────────────────────────────────────────

async def _worker_loop() -> None:
    """
    Main worker loop — runs until cancelled.

    Each iteration:
    1. Check retry queue for ready messages → re-enqueue them
    2. BRPOP primary queue (5s timeout)
    3. If message: process it, handle retry/DLQ on failure
    4. Set heartbeat (120s TTL — if worker dies, heartbeat expires)
    """
    logger.info("[Worker] Webhook worker loop started.")

    redis = await get_redis_client()
    queue = RedisQueueAdapter(redis)

    while True:
        try:
            # ── Set heartbeat (before dequeue so it's always fresh) ───────────
            await queue.set_heartbeat(ttl_seconds=120)

            # ── Poll retry queue for ready messages ───────────────────────────
            ready_retries = await queue.poll_retry_queue()
            for retry_msg in ready_retries:
                logger.info(
                    "[Worker] Re-enqueueing retry message",
                    extra={
                        "signal_id": str(retry_msg.signal_id),
                        "retry_count": retry_msg.retry_count,
                    },
                )
                await queue.enqueue(retry_msg)

            # ── Dequeue next signal (BRPOP, 5s timeout) ───────────────────────
            message = await queue.dequeue(timeout_seconds=5)
            if message is None:
                continue  # Timeout — loop again

            logger.info(
                "[Worker] Dequeued signal",
                extra={
                    "signal_id": str(message.signal_id),
                    "strategy_id": str(message.strategy_id),
                    "retry_count": message.retry_count,
                },
            )

            # ── Process the signal ────────────────────────────────────────────
            final_status = await _process_with_retry(queue, message)

            logger.info(
                "[Worker] Signal processing complete",
                extra={
                    "signal_id": str(message.signal_id),
                    "final_status": final_status,
                },
            )

        except asyncio.CancelledError:
            logger.info("[Worker] Worker loop cancelled — shutting down.")
            break
        except Exception as exc:
            # Unexpected error in the loop itself (not in signal processing)
            logger.error(
                "[Worker] Unexpected loop error",
                extra={"error": str(exc)},
                exc_info=True,
            )
            await asyncio.sleep(1)  # Brief pause before retrying the loop


async def _process_with_retry(queue: RedisQueueAdapter, message: QueueMessage) -> str:
    """
    Processes a signal. On failure, schedules a retry or sends to DLQ.
    Returns the final status string.
    """
    async with AsyncSessionLocal() as db:
        svc = ExecutionService(db)
        final_status = await svc.process_signal(
            signal_id=message.signal_id,
            strategy_id=message.strategy_id,
        )

    # Handle retry logic based on final status
    if final_status in (SignalStatus.FAILED,):
        if message.retry_count < settings.webhook_max_retries:
            delay = settings.webhook_retry_delays[
                min(message.retry_count, len(settings.webhook_retry_delays) - 1)
            ]
            logger.info(
                "[Worker] Scheduling retry",
                extra={
                    "signal_id": str(message.signal_id),
                    "retry_count": message.retry_count,
                    "delay_seconds": delay,
                },
            )
            await queue.enqueue_retry(message, delay_seconds=delay)
        else:
            logger.warning(
                "[Worker] Max retries reached — sending to DLQ",
                extra={
                    "signal_id": str(message.signal_id),
                    "retry_count": message.retry_count,
                },
            )
            await queue.send_to_dlq(
                message,
                reason=f"Max retries ({settings.webhook_max_retries}) exhausted. "
                       f"Final status: {final_status}",
            )

    return final_status


# ── Reconciliation loop ───────────────────────────────────────────────────────

async def _reconcile_loop() -> None:
    """
    Reconciliation loop — runs every 60 seconds.

    Tasks:
    1. Find signals stuck in PROCESSING state (worker crashed mid-flight)
       → Move to TIMEOUT status
    2. Expire grace-period secrets whose TTL has passed
       → Move to REVOKED status
    3. Find QUEUED signals not in the queue (enqueue failed after DB commit)
       → Re-enqueue them

    This loop makes the system self-healing after partial failures.
    """
    logger.info("[Reconcile] Reconciliation loop started.")
    redis = await get_redis_client()
    queue = RedisQueueAdapter(redis)

    while True:
        try:
            await asyncio.sleep(60)  # Run every 60 seconds

            async with AsyncSessionLocal() as db:
                # ── Task 1: Fix stuck PROCESSING signals ─────────────────────
                from app.webhooks.signal_service import SignalService
                signal_svc = SignalService(db, redis)
                stuck = await signal_svc.find_stuck_processing()
                if stuck:
                    logger.warning(
                        "[Reconcile] Found stuck PROCESSING signals",
                        extra={"count": len(stuck)},
                    )
                    for signal in stuck:
                        await signal_svc.update_status(
                            signal.id,
                            SignalStatus.TIMEOUT,
                            error=(
                                f"Signal stuck in PROCESSING for > "
                                f"{settings.webhook_processing_timeout_minutes} minutes. "
                                "Worker may have crashed. Reconciliation moved to TIMEOUT."
                            ),
                        )
                    await db.commit()

                # ── Task 2: Expire grace-period secrets ───────────────────────
                from app.webhooks.secret_service import SecretService
                secret_svc = SecretService(db)
                expired_count = await secret_svc.expire_grace_periods()
                if expired_count:
                    logger.info(
                        "[Reconcile] Expired grace-period secrets",
                        extra={"count": expired_count},
                    )
                    await db.commit()

                # ── Task 3: Re-queue orphaned QUEUED signals ──────────────────
                from sqlalchemy import select
                from app.models.strategy import StrategySignal
                from datetime import timedelta

                orphan_result = await db.execute(
                    select(StrategySignal).where(
                        StrategySignal.status == SignalStatus.QUEUED,
                        StrategySignal.received_at < (
                            datetime.now(timezone.utc) - timedelta(minutes=2)
                        ),
                        StrategySignal.is_test == False,  # noqa: E712
                    ).limit(20)
                )
                orphans = orphan_result.scalars().all()
                if orphans:
                    logger.warning(
                        "[Reconcile] Re-enqueueing orphaned QUEUED signals",
                        extra={"count": len(orphans)},
                    )
                    for orphan in orphans:
                        try:
                            await queue.enqueue(
                                QueueMessage(
                                    signal_id=orphan.id,
                                    strategy_id=orphan.strategy_id,
                                )
                            )
                        except Exception as enq_exc:
                            logger.error(
                                "[Reconcile] Failed to re-enqueue orphan",
                                extra={
                                    "signal_id": str(orphan.id),
                                    "error": str(enq_exc),
                                },
                            )

        except asyncio.CancelledError:
            logger.info("[Reconcile] Reconciliation loop cancelled — shutting down.")
            break
        except Exception as exc:
            logger.error(
                "[Reconcile] Reconciliation loop error",
                extra={"error": str(exc)},
                exc_info=True,
            )
            # Don't crash the loop — try again on next iteration


# ── Start / Stop (called from main.py) ───────────────────────────────────────

def start_webhook_worker() -> None:
    """
    Starts the worker and reconciliation asyncio tasks.
    Called from main.py startup event. Safe to call multiple times (idempotent).
    """
    global _worker_task, _reconcile_task

    if _worker_task is None or _worker_task.done():
        _worker_task = asyncio.create_task(_worker_loop(), name="webhook_worker")
        logger.info("[Worker] Webhook worker task created.")

    if _reconcile_task is None or _reconcile_task.done():
        _reconcile_task = asyncio.create_task(_reconcile_loop(), name="webhook_reconcile")
        logger.info("[Reconcile] Reconciliation task created.")


def stop_webhook_worker() -> None:
    """
    Gracefully cancels worker and reconciliation tasks.
    Called from main.py shutdown event.
    """
    global _worker_task, _reconcile_task

    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        logger.info("[Worker] Webhook worker task cancelled.")

    if _reconcile_task and not _reconcile_task.done():
        _reconcile_task.cancel()
        logger.info("[Reconcile] Reconciliation task cancelled.")

    _worker_task = None
    _reconcile_task = None
