# app/ports/queue.py
# AlgoFin v2 — Phase M: Queue port interface
#
# QueuePort decouples the Execution domain from the queue transport mechanism.
# Current adapter: RedisQueueAdapter (LPUSH/BRPOP via Upstash Redis)
# Future adapters: CeleryQueueAdapter, KafkaQueueAdapter
#
# Switching from Redis to Kafka requires only a new adapter class.
# ExecutionService and WebhookService never change.

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol, runtime_checkable


@dataclass
class QueueMessage:
    """
    The payload pushed to and popped from the queue.

    Only signal_id is the business identifier — worker resolves full details
    from the DB. This keeps queue messages small (< 200 bytes).

    retry_count is incremented by the worker on transient failure.
    Max retries: 3 (defined in config.py Tier 2). After 3 → DLQ.
    """
    signal_id: uuid.UUID
    strategy_id: uuid.UUID          # for logging/routing without extra DB query
    retry_count: int = 0
    enqueued_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_json(self) -> dict:
        return {
            "signal_id": str(self.signal_id),
            "strategy_id": str(self.strategy_id),
            "retry_count": self.retry_count,
            "enqueued_at": self.enqueued_at.isoformat(),
        }

    @classmethod
    def from_json(cls, data: dict) -> "QueueMessage":
        return cls(
            signal_id=uuid.UUID(data["signal_id"]),
            strategy_id=uuid.UUID(data["strategy_id"]),
            retry_count=data.get("retry_count", 0),
            enqueued_at=datetime.fromisoformat(data["enqueued_at"]),
        )


@runtime_checkable
class QueuePort(Protocol):
    """
    Port for async signal queue operations.

    Queue design (documented in architecture):
        Primary queue:  algofin:webhook_queue   (LPUSH / BRPOP)
        Retry queue:    algofin:webhook_retry   (ZADD by execute_at timestamp)
        Dead-letter:    algofin:webhook_dlq     (LPUSH; admin-inspectable)

    Delivery guarantee: at-least-once.
    Workers must be idempotent (enforced by UNIQUE signal_id on execution_records).
    """

    async def enqueue(self, message: QueueMessage) -> None:
        """
        Pushes a message to the primary queue.
        Called by WebhookService after signal INSERT commits.
        Non-blocking — must return in < 20ms (within webhook latency budget).
        """
        ...

    async def dequeue(self, timeout_seconds: int = 5) -> QueueMessage | None:
        """
        Blocking pop from the primary queue.
        Returns None on timeout (worker loop continues).
        Called exclusively by the worker coroutine.
        """
        ...

    async def enqueue_retry(self, message: QueueMessage, delay_seconds: int) -> None:
        """
        Schedules a retry with a delay.
        Retry policy (from architecture Tier 2 constants):
            1st retry: 1 second
            2nd retry: 5 seconds
            3rd retry: 30 seconds
        After 3rd failure → send_to_dlq().
        """
        ...

    async def send_to_dlq(self, message: QueueMessage, reason: str) -> None:
        """
        Moves a message to the dead-letter queue.
        Triggered when retry_count >= MAX_WEBHOOK_RETRIES.
        DLQ entries visible in admin panel for manual replay or discard.
        """
        ...

    async def queue_depth(self) -> int:
        """
        Returns current primary queue depth.
        Used by /health endpoint and metrics.
        Alert threshold: > 50 (defined in architecture NFRs).
        """
        ...

    async def dlq_depth(self) -> int:
        """
        Returns dead-letter queue depth.
        Alert threshold: > 0 (any DLQ entry triggers High alert).
        """
        ...

    async def poll_retry_queue(self) -> list[QueueMessage]:
        """
        Pops messages from retry queue whose delay has expired.
        Called by worker on each loop iteration to re-enqueue ready retries.
        """
        ...
