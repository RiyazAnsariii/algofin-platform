# app/adapters/redis_queue.py
# AlgoFin v2 — Phase M: RedisQueueAdapter
#
# Implements QueuePort using Redis LPUSH / BRPOP.
# Queue architecture:
#   Primary  algofin:webhook_queue   — LPUSH (enqueue) / BRPOP (worker dequeue)
#   Retry    algofin:webhook_retry   — ZADD score=execute_at_unix / ZRANGEBYSCORE (poll)
#   DLQ      algofin:webhook_dlq     — LPUSH (dead letter, admin-inspectable)
#
# Delivery: at-least-once. Workers must be idempotent.
# Idempotency enforced by: UNIQUE(signal_id) on execution_records table.

import json
import time
import uuid
from datetime import datetime, timezone

from app.config import settings
from app.ports.queue import QueueMessage, QueuePort


class RedisQueueAdapter:
    """
    Redis implementation of QueuePort.

    Uses redis.asyncio (already a project dependency).
    Injected into WebhookService and the worker loop at startup.
    """

    def __init__(self, redis_client) -> None:
        """
        redis_client: an instance of redis.asyncio.Redis
        (returned by app.database.get_redis_client())
        """
        self._r = redis_client

    # ── Enqueue ──────────────────────────────────────────────────────────────

    async def enqueue(self, message: QueueMessage) -> None:
        """
        Pushes message to the PRIMARY queue (left push → FIFO with BRPOP from right).
        Called by WebhookService after signal INSERT commits.
        Budget: < 15ms (Redis RTT to Upstash US-West).
        """
        payload = json.dumps(message.to_json())
        await self._r.lpush(settings.webhook_queue_key, payload)

    # ── Dequeue ───────────────────────────────────────────────────────────────

    async def dequeue(self, timeout_seconds: int = 5) -> QueueMessage | None:
        """
        Blocking pop from the PRIMARY queue (BRPOP with timeout).
        Returns None on timeout — worker loop continues.

        BRPOP returns (key, value) tuple; we only need value.
        """
        result = await self._r.brpop(
            settings.webhook_queue_key,
            timeout=timeout_seconds,
        )
        if result is None:
            return None  # Timeout — no message
        _, raw = result
        return QueueMessage.from_json(json.loads(raw))

    # ── Retry Queue ───────────────────────────────────────────────────────────

    async def enqueue_retry(self, message: QueueMessage, delay_seconds: int) -> None:
        """
        Schedules message in the RETRY sorted set.
        Score = unix timestamp when message should be re-enqueued.
        ZADD with NX (do not update if already scheduled — idempotent).
        """
        message.retry_count += 1
        execute_at = time.time() + delay_seconds
        payload = json.dumps(message.to_json())
        await self._r.zadd(
            settings.webhook_retry_key,
            {payload: execute_at},
            nx=True,  # Don't overwrite if key already scheduled
        )

    async def poll_retry_queue(self) -> list[QueueMessage]:
        """
        Pops all retry messages whose execute_at has passed.
        Called by worker on each loop iteration.
        Uses ZRANGEBYSCORE 0 now() then ZREM for atomic-ish pop.

        Note: Not perfectly atomic (use Lua script in high-throughput future).
        At current scale (< 100 signals/min) this is sufficient.
        """
        now = time.time()
        # Get all ready messages
        raw_list = await self._r.zrangebyscore(
            settings.webhook_retry_key,
            min=0,
            max=now,
        )
        if not raw_list:
            return []

        # Remove them from retry set (best-effort — idempotency handles duplicates)
        await self._r.zrem(settings.webhook_retry_key, *raw_list)

        messages = []
        for raw in raw_list:
            try:
                messages.append(QueueMessage.from_json(json.loads(raw)))
            except Exception:
                pass  # Malformed entry — skip silently (logged by caller)
        return messages

    # ── Dead Letter Queue ─────────────────────────────────────────────────────

    async def send_to_dlq(self, message: QueueMessage, reason: str) -> None:
        """
        Moves message to the DLQ with reason and timestamp.
        DLQ entries are LPUSH'd — visible via LRANGE for admin inspection.
        Alert: any DLQ depth > 0 triggers a High alert (architecture NFR).
        """
        dlq_entry = {
            **message.to_json(),
            "dlq_reason": reason,
            "dlq_at": datetime.now(timezone.utc).isoformat(),
        }
        await self._r.lpush(
            settings.webhook_dlq_key,
            json.dumps(dlq_entry),
        )

    # ── Metrics ───────────────────────────────────────────────────────────────

    async def queue_depth(self) -> int:
        """Primary queue depth. Alert threshold: > 50."""
        length = await self._r.llen(settings.webhook_queue_key)
        return int(length)

    async def dlq_depth(self) -> int:
        """DLQ depth. Alert threshold: > 0 (any DLQ entry is an alert)."""
        length = await self._r.llen(settings.webhook_dlq_key)
        return int(length)

    # ── Heartbeat (not on QueuePort — used by worker only) ────────────────────

    async def set_heartbeat(self, ttl_seconds: int = 120) -> None:
        """
        Sets a heartbeat key in Redis with TTL.
        Worker calls this every loop iteration.
        If key expires → worker is dead → Critical alert fires.
        """
        await self._r.set(
            settings.worker_heartbeat_key,
            datetime.now(timezone.utc).isoformat(),
            ex=ttl_seconds,
        )

    async def get_heartbeat_age_seconds(self) -> float | None:
        """
        Returns seconds since last heartbeat, or None if key missing (worker dead).
        Used by /health endpoint.
        """
        val = await self._r.get(settings.worker_heartbeat_key)
        if val is None:
            return None
        last = datetime.fromisoformat(val)
        return (datetime.now(timezone.utc) - last).total_seconds()
