# app/adapters/postgres_signal_repo.py
# AlgoFin v2 — Phase M: Postgres adapters for Signal, Execution, and Audit
#
# Three adapters in one file — they are small and tightly related.
# All implement ports from app/ports/repositories.py.

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.strategy import (
    StrategySignal,
    ExecutionRecord,
    StrategyAuditLog,
    DomainEventOutbox,
)
from app.ports.repositories import SignalReadModel


# ── PostgresSignalRepository ─────────────────────────────────────────────────

class PostgresSignalRepository:
    """
    PostgreSQL implementation of SignalRepository.
    Zero business logic — pure SQLAlchemy queries.
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def insert(self, signal: StrategySignal) -> None:
        """
        Adds signal to the session. Caller must flush/commit.
        IntegrityError on duplicate idempotency_key is intentional —
        it is the DB-level dedup safety net.
        """
        self._db.add(signal)

    async def find_for_execution(
        self,
        signal_id: uuid.UUID,
    ) -> SignalReadModel | None:
        """
        Returns SignalReadModel for worker execution (BC2 → BC3 crossing).
        Joins with Strategy to resolve exchange_account_id.
        """
        from app.models.strategy import Strategy

        result = await self._db.execute(
            select(
                StrategySignal.id,
                StrategySignal.strategy_id,
                StrategySignal.user_id,
                StrategySignal.action,
                StrategySignal.ticker,
                StrategySignal.contracts,
                StrategySignal.price,
                StrategySignal.is_test,
                Strategy.exchange_account_id,
            )
            .join(Strategy, Strategy.id == StrategySignal.strategy_id)
            .where(StrategySignal.id == signal_id)
        )
        row = result.one_or_none()
        if row is None:
            return None

        return SignalReadModel(
            id=row.id,
            strategy_id=row.strategy_id,
            user_id=row.user_id,
            action=row.action,
            ticker=row.ticker,
            contracts=row.contracts,
            price=row.price,
            is_test=row.is_test,
            exchange_account_id=row.exchange_account_id,
        )

    async def update_status(
        self,
        signal_id: uuid.UUID,
        new_status: str,
        *,
        order_id: uuid.UUID | None = None,
        error: str | None = None,
        processing_duration_ms: int | None = None,
        processed_at: datetime | None = None,
    ) -> None:
        """Bulk UPDATE on strategy_signals — avoids SELECT + ORM overhead on hot path."""
        values: dict = {"status": new_status}
        if order_id is not None:
            values["order_id"] = order_id
        if error is not None:
            values["error"] = error
        if processing_duration_ms is not None:
            values["processing_duration_ms"] = processing_duration_ms
        if processed_at is not None:
            values["processed_at"] = processed_at
        elif new_status not in ("QUEUED", "PROCESSING"):
            values["processed_at"] = datetime.now(timezone.utc)

        await self._db.execute(
            update(StrategySignal)
            .where(StrategySignal.id == signal_id)
            .values(**values)
        )

    async def find_stuck_processing(self, older_than_minutes: int = 5) -> list[StrategySignal]:
        """Signals stuck in PROCESSING state — for reconciliation job."""
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)
        result = await self._db.execute(
            select(StrategySignal).where(
                StrategySignal.status == "PROCESSING",
                StrategySignal.received_at < cutoff,
            )
        )
        return list(result.scalars().all())

    async def list_by_strategy(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[StrategySignal]:
        """Paginated signal history. Index: ix_strategy_signals_strategy_received."""
        result = await self._db.execute(
            select(StrategySignal)
            .where(
                StrategySignal.strategy_id == strategy_id,
                StrategySignal.user_id == user_id,
            )
            .order_by(StrategySignal.received_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())


# ── PostgresExecutionRepository ───────────────────────────────────────────────

class PostgresExecutionRepository:
    """
    PostgreSQL implementation of ExecutionRepository.
    ExecutionRecord: one-to-one with StrategySignal (UNIQUE signal_id).
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def insert(self, record: ExecutionRecord) -> None:
        """
        Adds ExecutionRecord to session. Caller manages commit.
        IntegrityError on duplicate signal_id = idempotent second delivery.
        """
        self._db.add(record)

    async def find_by_signal(
        self,
        signal_id: uuid.UUID,
    ) -> ExecutionRecord | None:
        result = await self._db.execute(
            select(ExecutionRecord).where(ExecutionRecord.signal_id == signal_id)
        )
        return result.scalar_one_or_none()

    async def list_by_strategy(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 50,
    ) -> list[ExecutionRecord]:
        result = await self._db.execute(
            select(ExecutionRecord)
            .where(
                ExecutionRecord.strategy_id == strategy_id,
                ExecutionRecord.user_id == user_id,
            )
            .order_by(ExecutionRecord.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())


# ── PostgresAuditAdapter ──────────────────────────────────────────────────────

class PostgresAuditAdapter:
    """
    PostgreSQL implementation of AuditPort.
    Writes to strategy_audit_log — append-only, no SELECT/UPDATE/DELETE.

    Uses the Outbox pattern for cross-context delivery:
    1. Writes to strategy_audit_log directly (fast, in same transaction)
    2. Also writes to domain_event_outbox for async event fanout (analytics etc.)
    """

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def log(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID | None,
        action: str,
        old_value: dict | None = None,
        new_value: dict | None = None,
    ) -> None:
        """
        Appends audit entry and writes an outbox event.
        Both writes are in the same DB transaction — atomic.
        Fire-and-forget semantics: does not raise (logs internally on error).
        """
        try:
            # 1. Direct audit log write
            entry = StrategyAuditLog(
                strategy_id=strategy_id,
                user_id=user_id,
                action=action,
                old_value=old_value,
                new_value=new_value,
            )
            self._db.add(entry)

            # 2. Outbox event for async fanout (analytics, notifications)
            outbox_event = DomainEventOutbox(
                event_type="StrategyAuditLogged",
                payload={
                    "strategy_id": str(strategy_id),
                    "user_id": str(user_id) if user_id else None,
                    "action": action,
                    "old_value": old_value,
                    "new_value": new_value,
                    "logged_at": datetime.now(timezone.utc).isoformat(),
                },
                status="pending",
            )
            self._db.add(outbox_event)
        except Exception as exc:
            # Audit log failure must NEVER break the main operation
            # Log to Python logger but do not re-raise
            import logging
            logging.getLogger(__name__).error(
                "AuditPort.log() failed — audit entry may be missing",
                extra={
                    "strategy_id": str(strategy_id),
                    "action": action,
                    "error": str(exc),
                },
            )
