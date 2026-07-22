# app/ports/repositories.py
# AlgoFin v2 — Phase M: Repository and Audit port interfaces
#
# These are abstract interfaces (Protocols). Domain services depend only on these.
# Concrete implementations live in app/adapters/ and are injected at runtime.
#
# Bounded context contracts are defined here as read models — the only data
# allowed to cross bounded context boundaries.

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol, runtime_checkable

# ── Bounded Context Read Models ──────────────────────────────────────────────
# Read models define exactly what data crosses a context boundary.
# They are frozen (immutable) value objects, not ORM entities.

@dataclass(frozen=True)
class StrategyReadModel:
    """
    Data from Strategy Context that Signal Context needs at signal receipt time.
    BC1 → BC2 contract: only this data crosses the boundary.
    """
    id: uuid.UUID
    user_id: uuid.UUID
    status: str                    # must be "active" to accept signals
    is_test_mode: bool             # True → signals logged but not executed
    current_version: int           # recorded on signal for Pine audit trail
    exchange_account_id: uuid.UUID # which account to trade on


@dataclass(frozen=True)
class SignalReadModel:
    """
    Data from Signal Context that Execution Context needs to process a signal.
    BC2 → BC3 contract: only this data crosses the boundary.
    """
    id: uuid.UUID
    strategy_id: uuid.UUID
    user_id: uuid.UUID
    action: str                    # "buy" | "sell"
    ticker: str
    contracts: Decimal | None
    price: Decimal | None
    is_test: bool
    exchange_account_id: uuid.UUID # resolved from strategy at receipt time


# ── Repository Ports ─────────────────────────────────────────────────────────

@runtime_checkable
class StrategyRepository(Protocol):
    """
    Port for Strategy persistence.
    Owned by: StrategyService.
    Implementations: PostgresStrategyRepository (production), InMemoryStrategyRepository (tests).
    """

    async def find_for_signal(self, strategy_id: uuid.UUID) -> StrategyReadModel | None:
        """
        Returns StrategyReadModel for signal validation.
        Called by SignalService on every webhook receipt.
        Must be fast (< 50ms). Uses index on strategies.id.
        """
        ...

    async def find_by_id(self, strategy_id: uuid.UUID, user_id: uuid.UUID) -> object | None:
        """
        Returns full Strategy ORM object for authorized user.
        Used by StrategyService for lifecycle operations.
        """
        ...

    async def list_by_user(
        self,
        user_id: uuid.UUID,
        status_filter: str | None = None,
        strategy_type: str | None = None,
    ) -> list[object]:
        """Returns all strategies owned by user, optionally filtered."""
        ...

    async def save(self, strategy: object) -> None:
        """Persists a new or updated Strategy. Caller manages the transaction."""
        ...

    async def count_active(self, user_id: uuid.UUID) -> int:
        """
        Returns count of active pine_webhook strategies for user.
        Used by system-wide invariant: max 50 active strategies per user.
        """
        ...


@runtime_checkable
class SignalRepository(Protocol):
    """
    Port for StrategySignal persistence.
    Owned by: SignalService.
    """

    async def insert(self, signal: object) -> None:
        """
        Inserts a new StrategySignal.
        Called within a DB transaction in the webhook handler.
        Raises IntegrityError if idempotency_key already exists (dedup safety net).
        """
        ...

    async def find_for_execution(self, signal_id: uuid.UUID) -> SignalReadModel | None:
        """
        Returns SignalReadModel for worker execution.
        BC2 → BC3 crossing point: returns only the fields Execution Context needs.
        """
        ...

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
        """
        Updates mutable fields on a signal.
        Only SignalService may call this — enforces Principle 10 (Bounded Context Sovereignty).
        """
        ...

    async def find_stuck_processing(self, older_than_minutes: int = 5) -> list[object]:
        """
        Returns signals stuck in PROCESSING state for reconciliation job.
        WHERE status='PROCESSING' AND updated_at < now() - interval.
        """
        ...

    async def list_by_strategy(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[object]:
        """Returns paginated signal history for a strategy (UI signal history panel)."""
        ...


@runtime_checkable
class SecretRepository(Protocol):
    """
    Port for StrategyWebhookSecret lifecycle.
    Owned by: SecretService.
    """

    async def find_active_secrets(self, strategy_id: uuid.UUID) -> list[object]:
        """
        Returns all active or grace_period secrets for a strategy.
        Called on every webhook receipt for secret verification.
        Typically returns 1 (active) or 2 (during rotation grace period) rows.
        """
        ...

    async def insert(self, secret: object) -> None:
        """Inserts a new WebhookSecret row."""
        ...

    async def update_status(
        self,
        secret_id: uuid.UUID,
        new_status: str,
        *,
        revoked_at: datetime | None = None,
        grace_expires_at: datetime | None = None,
    ) -> None:
        """Updates secret status (active → grace_period → revoked)."""
        ...

    async def expire_grace_period_secrets(self) -> int:
        """
        Revokes grace_period secrets whose grace_expires_at has passed.
        Called by the reconciliation background job.
        Returns count of secrets revoked.
        """
        ...


@runtime_checkable
class VersionRepository(Protocol):
    """
    Port for StrategyPineVersion versioned storage.
    Owned by: VersionService.

    Invariant: versions are immutable after INSERT.
    No update or delete operations defined on this port.
    """

    async def insert_version(
        self,
        strategy_id: uuid.UUID,
        version_number: int,
        pine_code: str,
    ) -> object:
        """
        Creates a new immutable Pine version.
        version_number must be strategy.current_version + 1.
        Raises IntegrityError if uq_pine_version_per_strategy is violated.
        """
        ...

    async def find_version(
        self,
        strategy_id: uuid.UUID,
        version_number: int,
    ) -> object | None:
        """Returns a specific Pine version (for diff view, restore, audit)."""
        ...

    async def list_versions(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> list[object]:
        """Returns all versions for a strategy, newest first (for version history UI)."""
        ...


@runtime_checkable
class ExecutionRepository(Protocol):
    """
    Port for ExecutionRecord persistence.
    Owned by: ExecutionService.

    ExecutionRecord separates what was RECEIVED (Signal) from what was DECIDED (Execution).
    One-to-one with StrategySignal — UNIQUE (signal_id) constraint enforces idempotency.
    """

    async def insert(self, record: object) -> None:
        """
        Inserts an ExecutionRecord.
        Called within the same transaction as the signal status update.
        Raises IntegrityError if signal_id already has an execution (idempotency).
        """
        ...

    async def find_by_signal(self, signal_id: uuid.UUID) -> object | None:
        """Returns ExecutionRecord for a given signal (for display and debugging)."""
        ...

    async def list_by_strategy(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 50,
    ) -> list[object]:
        """Returns recent execution records for analytics and history display."""
        ...


@runtime_checkable
class AuditPort(Protocol):
    """
    Port for StrategyAuditLog writes.
    Owned by: AuditService.

    Architectural rule: AuditPort only has INSERT operations.
    No SELECT, no UPDATE, no DELETE exposed through this port.
    Reads are done via AnalyticsService through AnalyticsPort.
    """

    async def log(
        self,
        strategy_id: uuid.UUID,
        user_id: uuid.UUID | None,
        action: str,
        old_value: dict | None = None,
        new_value: dict | None = None,
    ) -> None:
        """
        Appends an audit entry. Fire-and-forget — does not raise on failure
        (audit log is eventually consistent; it does not block execution).
        Internally: writes to domain_event_outbox for outbox-based delivery.
        """
        ...
