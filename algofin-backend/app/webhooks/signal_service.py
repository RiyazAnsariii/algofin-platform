# app/webhooks/signal_service.py
# AlgoFin v2 — Phase M: SignalService
#
# SignalService owns the StrategySignal bounded context (BC2):
#   - Validates the signal payload
#   - Performs deduplication (Redis fast path + DB safety net)
#   - Persists the StrategySignal record
#   - Updates signal status (owned exclusively by this service)
#   - Exposes SignalReadModel to Execution Context (BC3)
#
# Principle 10 (Bounded Context Sovereignty):
#   No other service writes to strategy_signals.status.
#   ExecutionService calls SignalService.update_status() — never writes directly.

import hashlib
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.strategy import StrategySignal
from app.ports.repositories import StrategyReadModel, SignalReadModel
from app.ports.signal_source import SignalPayload


# ── Signal status constants ───────────────────────────────────────────────────
# All defined in one place so they are never hard-coded as raw strings elsewhere.


class SignalStatus:
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    ORDER_SUBMITTED = "ORDER_SUBMITTED"
    ORDER_FILLED = "ORDER_FILLED"
    ORDER_REJECTED = "ORDER_REJECTED"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    RISK_BLOCKED = "RISK_BLOCKED"
    FAILED = "FAILED"
    TIMEOUT = "TIMEOUT"
    DUPLICATE = "DUPLICATE"
    STALE = "STALE"
    INVALID = "INVALID"
    STRATEGY_PAUSED = "STRATEGY_PAUSED"
    TEST_ACCEPTED = "TEST_ACCEPTED"

    TERMINAL = frozenset(
        {
            ORDER_FILLED,
            ORDER_REJECTED,
            ORDER_CANCELLED,
            RISK_BLOCKED,
            FAILED,
            TIMEOUT,
            DUPLICATE,
            STALE,
            INVALID,
            STRATEGY_PAUSED,
            TEST_ACCEPTED,
        }
    )


class SignalValidationError(Exception):
    """Raised when a signal fails validation (before DB write)."""

    pass


class DuplicateSignalError(Exception):
    """Raised when Redis fast-path detects a duplicate idempotency key."""

    pass


class SignalService:
    """
    Owns the StrategySignal lifecycle (BC2).

    Responsibilities:
    - Compute idempotency key from signal payload
    - Redis fast-path dedup (before DB write)
    - Persist StrategySignal with status=QUEUED
    - Update signal status (the ONLY write path to strategy_signals.status)
    - Expose SignalReadModel for Execution Context

    Does NOT own:
    - Secret verification (→ SecretService)
    - Order placement (→ ExecutionService / ExchangePort)
    - Strategy state transitions (→ StrategyService)
    """

    def __init__(self, db: AsyncSession, redis=None) -> None:
        self._db = db
        self._redis = redis  # Optional: Redis client for dedup fast path

    # ── Idempotency Key ──────────────────────────────────────────────────────

    @staticmethod
    def compute_idempotency_key(
        strategy_id: uuid.UUID,
        action: str,
        ticker: str,
        contracts: Decimal | None,
        tv_timestamp: datetime | None,
    ) -> str:
        """
        Computes a deterministic 64-char SHA-256 idempotency key.

        Formula: SHA256(strategy_id | action | ticker | contracts | tv_timestamp_unix)
        All components normalized to lowercase/string to avoid encoding ambiguity.

        If tv_timestamp is None (alert misconfigured): uses "none" — accepting
        that dedup is weakened for non-timestamped signals.
        """
        ts_str = str(int(tv_timestamp.timestamp())) if tv_timestamp else "none"
        raw = "|".join(
            [
                str(strategy_id).lower(),
                action.lower(),
                ticker.upper(),
                str(contracts) if contracts is not None else "none",
                ts_str,
            ]
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    # ── Dedup (Redis fast path) ───────────────────────────────────────────────

    async def check_and_reserve_dedup(self, idempotency_key: str) -> bool:
        """
        Attempts to reserve the idempotency key in Redis (SETNX with TTL).
        Returns True if this is a NEW signal (key was set).
        Returns False if this is a DUPLICATE (key already existed).

        Falls back to True (allow) if Redis is unavailable.
        The DB UNIQUE constraint on idempotency_key is the safety net.
        """
        if not self._redis:
            return True  # No Redis: fall through to DB constraint

        try:
            redis_key = f"{settings.webhook_dedup_prefix}{idempotency_key}"
            was_set = await self._redis.set(
                redis_key,
                "1",
                nx=True,  # Only set if not exists
                ex=settings.webhook_dedup_ttl_seconds,
            )
            return bool(was_set)
        except Exception:
            # Redis unavailable: allow the signal (DB will catch true duplicates)
            return True

    # ── Persist ───────────────────────────────────────────────────────────────

    async def persist_signal(
        self,
        payload: SignalPayload,
        strategy: StrategyReadModel,
        idempotency_key: str,
        sender_ip: str | None = None,
    ) -> StrategySignal:
        """
        Creates and persists a StrategySignal record with status=QUEUED.

        Called within the webhook handler's DB transaction.
        If idempotency_key already exists in DB → IntegrityError (caller handles it).

        For test signals (is_test=True): status is set to TEST_ACCEPTED immediately
        (no worker processing needed).
        """
        initial_status = (
            SignalStatus.TEST_ACCEPTED
            if payload.is_test or strategy.is_test_mode
            else SignalStatus.QUEUED
        )

        signal = StrategySignal(
            strategy_id=strategy.id,
            user_id=strategy.user_id,
            strategy_version=strategy.current_version,
            action=payload.action.lower(),
            ticker=payload.ticker.upper(),
            contracts=payload.contracts,
            price=payload.price,
            tv_timestamp=payload.tv_timestamp,
            idempotency_key=idempotency_key,
            sender_ip=sender_ip,
            raw_payload=payload.raw_payload,
            status=initial_status,
            is_test=payload.is_test or strategy.is_test_mode,
        )
        self._db.add(signal)
        await self._db.flush()  # Get the generated ID without committing
        return signal

    # ── Status Updates (sole writer for strategy_signals.status) ─────────────

    async def update_status(
        self,
        signal_id: uuid.UUID,
        new_status: str,
        *,
        order_id: uuid.UUID | None = None,
        error: str | None = None,
        processing_duration_ms: int | None = None,
    ) -> None:
        """
        Updates mutable fields on a StrategySignal.

        THIS IS THE ONLY METHOD ALLOWED TO WRITE strategy_signals.status.
        Principle 10 (Bounded Context Sovereignty): ExecutionService calls
        this method — it never writes to strategy_signals directly.

        Raises ValueError if transitioning to a non-terminal status from a terminal one.
        """
        result = await self._db.execute(
            select(StrategySignal).where(StrategySignal.id == signal_id)
        )
        signal = result.scalar_one_or_none()
        if not signal:
            return  # Signal deleted (e.g., strategy archived mid-flight) — safe no-op

        if signal.status in SignalStatus.TERMINAL:
            if new_status in SignalStatus.TERMINAL:
                return  # Already terminal — idempotent no-op
            raise ValueError(
                f"Cannot transition signal {signal_id} from terminal status "
                f"{signal.status!r} to {new_status!r}."
            )

        signal.status = new_status
        if order_id:
            signal.order_id = order_id
        if error:
            signal.error = error
        if processing_duration_ms:
            signal.processing_duration_ms = processing_duration_ms
        if new_status in SignalStatus.TERMINAL:
            signal.processed_at = datetime.now(timezone.utc)

    # ── BC2 → BC3 crossing point ─────────────────────────────────────────────

    async def get_signal_read_model(
        self,
        signal_id: uuid.UUID,
        exchange_account_id: uuid.UUID,
    ) -> SignalReadModel | None:
        """
        Returns the SignalReadModel for Execution Context consumption.

        This is the BC2 → BC3 boundary crossing.
        Only the fields needed by ExecutionService are exposed.
        """
        result = await self._db.execute(
            select(StrategySignal).where(StrategySignal.id == signal_id)
        )
        signal = result.scalar_one_or_none()
        if not signal:
            return None

        return SignalReadModel(
            id=signal.id,
            strategy_id=signal.strategy_id,
            user_id=signal.user_id,
            action=signal.action,
            ticker=signal.ticker,
            contracts=signal.contracts,
            price=signal.price,
            is_test=signal.is_test,
            exchange_account_id=exchange_account_id,
        )

    # ── History ───────────────────────────────────────────────────────────────

    async def list_signals(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[StrategySignal]:
        """Paginated signal history for the strategy detail page."""
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

    async def find_stuck_processing(self) -> list[StrategySignal]:
        """
        Returns signals stuck in PROCESSING state longer than the timeout.
        Used by reconciliation job (worker.py).
        These are moved to TIMEOUT status.
        """
        from datetime import timedelta

        cutoff = datetime.now(timezone.utc) - timedelta(
            minutes=settings.webhook_processing_timeout_minutes
        )
        result = await self._db.execute(
            select(StrategySignal).where(
                StrategySignal.status == SignalStatus.PROCESSING,
                StrategySignal.received_at < cutoff,
            )
        )
        return list(result.scalars().all())
