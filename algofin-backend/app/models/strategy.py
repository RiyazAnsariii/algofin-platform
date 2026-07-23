# app/models/strategy.py
# AlgoFin v2 — Phase F + Phase M: Strategy Engine models
#
# Original models (preserved, backward compatible):
#   Strategy          — user-defined trading strategy
#   StrategyExecution — append-only log for price_breakout/manual triggers
#
# Phase M additions:
#   StrategySignal        — immutable record of every incoming webhook signal
#   ExecutionRecord       — result of acting on a signal (risk + order outcome)
#   StrategyPineVersion   — immutable versioned snapshots of Pine Script code
#   StrategyWebhookSecret — rotatable per-strategy webhook secrets
#   StrategyAuditLog      — immutable append-only audit trail
#   StrategyTarget        — which exchange accounts a strategy executes on
#   DomainEventOutbox     — transactional outbox for reliable cross-context events

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    ForeignKey,
    UniqueConstraint,
    Index,
    func,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UUIDType


# ── Original Strategy model (extended, backward compatible) ──────────────────


class Strategy(Base):
    """
    A user-defined automated trading strategy.

    strategy_type values:
        price_breakout   — fires when symbol price crosses price_level
        manual           — user triggers manually; acts as a saved order template
        pine_webhook     — [Phase M] signal arrives via TradingView webhook

    status values (extended in Phase M):
        draft    — [Phase M] incomplete; does NOT receive webhook signals
        active   — engine evaluates / webhooks accepted
        paused   — user paused; signals are logged but NOT executed
        stopped  — max_executions reached or manually stopped
        archived — permanent terminal state; no transitions out

    Order params (stored flat — no JSON blob):
        exchange_account_id, symbol, order_side, order_type, quantity, limit_price

    price_breakout additional params:
        price_level  — trigger threshold
        direction    — "above" | "below"

    pine_webhook additional params (all nullable for other types):
        pine_code, timeframe, current_version, is_test_mode
    """

    __tablename__ = "strategies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ── Identity ──────────────────────────────────────────────────────
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    strategy_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # "price_breakout" | "manual" | "pine_webhook"

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # "draft" | "active" | "paused" | "stopped" | "archived"

    # ── Order parameters ──────────────────────────────────────────────
    symbol: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    order_side: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # "BUY" | "SELL" — nullable for pine_webhook (side comes from signal)
    order_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="MARKET"
    )
    # "MARKET" | "LIMIT"
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    # nullable for pine_webhook (quantity comes from signal)
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    reduce_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── price_breakout parameters ─────────────────────────────────────
    price_level: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # "above" | "below"

    # ── Execution limits ──────────────────────────────────────────────
    max_executions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    execution_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_executed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── pine_webhook fields (Phase M) ─────────────────────────────────
    pine_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Display-only storage. AlgoFin never compiles or interprets this.
    timeframe: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # e.g. "15m", "1h", "1D"
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # Bumped on every pine_code save. References StrategyPineVersion.version_number.
    is_test_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # If True: signals are logged but never executed (safe sandbox mode)

    # ── Timestamps ────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class StrategyExecution(Base):
    """
    Append-only log of every price_breakout / manual strategy trigger.
    Preserved for backward compatibility.
    Phase M pine_webhook signals use StrategySignal + ExecutionRecord instead.
    """

    __tablename__ = "strategy_executions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    trigger_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)

    status: Mapped[str] = mapped_column(String(20), nullable=False)
    # "triggered" | "order_placed" | "failed"
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# ── Phase M: New tables ──────────────────────────────────────────────────────


class StrategyWebhookSecret(Base):
    """
    Per-strategy webhook secret with rotation support.

    status values:
        active       — currently accepted; only one per strategy at a time
        grace_period — recently rotated; still accepted for 5 minutes
        revoked      — no longer accepted

    Plain secret is returned ONCE on creation/rotation and never stored.
    Only the bcrypt hash is persisted.
    """

    __tablename__ = "strategy_webhook_secrets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    secret_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    # bcrypt hash of the plain secret. Plain is never stored.

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # "active" | "grace_period" | "revoked"

    rotated_from_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # FK to previous secret row (for audit trail of rotations)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    grace_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # If status=grace_period: accepted until this timestamp


class StrategyPineVersion(Base):
    """
    Immutable versioned snapshot of Pine Script code.

    Versions are append-only. Never updated or deleted (except CASCADE on strategy delete).
    Restoring a previous version creates a NEW version with the old code.
    Strategy.current_version points to the active version_number.
    """

    __tablename__ = "strategy_pine_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Monotonically increasing per strategy. 1, 2, 3, ...
    pine_code: Mapped[str] = mapped_column(Text, nullable=False)
    # Immutable after INSERT.

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "strategy_id", "version_number", name="uq_pine_version_per_strategy"
        ),
    )


class StrategySignal(Base):
    """
    Immutable record of every incoming webhook signal.

    Signal Boundary — owns: receipt, validation, dedup, persistence, status tracking.
    Immutable after creation except: status, processed_at, error, order_id,
    processing_duration_ms (set by worker after execution).

    status state machine:
        QUEUED → PROCESSING → ORDER_SUBMITTED → ORDER_FILLED (terminal)
                                              → ORDER_REJECTED (terminal)
                                              → ORDER_CANCELLED (terminal)
                           → RISK_BLOCKED (terminal)
                           → FAILED (terminal)
                           → TIMEOUT (terminal)
        QUEUED → DUPLICATE (terminal, set synchronously)
        QUEUED → STALE (terminal, set synchronously)
        QUEUED → INVALID (terminal, set synchronously)
        QUEUED → STRATEGY_PAUSED (terminal, set by worker)
        QUEUED → TEST_ACCEPTED (terminal, set synchronously for test signals)
    """

    __tablename__ = "strategy_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    strategy_version: Mapped[int] = mapped_column(Integer, nullable=False)
    # Strategy.current_version at signal receipt time — links signal to Pine version

    # ── TradingView payload (immutable) ───────────────────────────────
    action: Mapped[str] = mapped_column(String(10), nullable=False)
    # "buy" | "sell" (normalized to lowercase)
    ticker: Mapped[str] = mapped_column(String(30), nullable=False)
    contracts: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    tv_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # {{timenow}} from TradingView payload — used for replay detection

    # ── Deduplication ─────────────────────────────────────────────────
    idempotency_key: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    # SHA256(strategy_id + action + ticker + str(contracts) + str(tv_timestamp_unix))
    # DB unique constraint is the final dedup safety net (Redis SETNX is the fast path)

    # ── Processing metadata ───────────────────────────────────────────
    sender_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Full payload as received — immutable, for forensic use

    # ── Mutable fields (updated by worker) ───────────────────────────
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="QUEUED")
    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # FK to orders table once order is placed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    processing_duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index("ix_strategy_signals_strategy_received", "strategy_id", "received_at"),
        Index("ix_strategy_signals_user_received", "user_id", "received_at"),
        Index("ix_strategy_signals_status_received", "status", "received_at"),
    )


class ExecutionRecord(Base):
    """
    Result of acting on a StrategySignal.

    Execution Boundary — owns: the business decision of what to do with a signal.
    One-to-one with StrategySignal (UNIQUE signal_id constraint).

    This table separates what was RECEIVED (Signal) from what was DECIDED (Execution).
    """

    __tablename__ = "execution_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    signal_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("strategy_signals.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # UNIQUE ensures idempotency: second delivery of same signal_id is a no-op
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    risk_result: Mapped[str] = mapped_column(String(10), nullable=False)
    # "PASS" | "BLOCK"
    risk_rule_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # FK to risk rule that blocked (if risk_result == "BLOCK")

    order_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # Populated when risk_result == "PASS" and order is submitted

    execution_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Time from worker dequeue to execution record write

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class StrategyAuditLog(Base):
    """
    Immutable, append-only audit trail for all strategy lifecycle events.

    NEVER updated or deleted by application code (except CASCADE on user delete,
    which anonymizes rather than hard-deletes for financial compliance).
    Retained for 5 years per data lifecycle policy.
    """

    __tablename__ = "strategy_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # SET NULL (not CASCADE) so audit entries survive user deletion

    action: Mapped[str] = mapped_column(String(50), nullable=False)
    # "created" | "published" | "paused" | "resumed" | "stopped" | "archived"
    # "pine_updated" | "secret_rotated" | "status_changed" | "test_mode_toggled"

    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    logged_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class StrategyTarget(Base):
    """
    Which exchange accounts a strategy executes on.

    Currently: one strategy always has one target (the exchange_account_id from Strategy).
    This table enables future multi-account fan-out without schema changes.
    """

    __tablename__ = "strategy_targets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "strategy_id", "exchange_account_id", name="uq_target_per_strategy"
        ),
    )


class DomainEventOutbox(Base):
    """
    Transactional outbox for reliable cross-bounded-context event delivery.

    Written in the SAME transaction as the state change.
    Background poller reads, dispatches to handlers, marks as delivered.
    At-least-once delivery — all handlers must be idempotent.

    status values:
        pending   — not yet dispatched
        delivered — successfully dispatched and processed
        failed    — dispatch failed after max retries → moved to dead letter
    """

    __tablename__ = "domain_event_outbox"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    # e.g. "OrderSubmitted", "ExecutionCompleted", "StrategyPublished", "SecretRotated"

    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    # Typed event DTO serialized to JSON

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (Index("ix_outbox_status_created", "status", "created_at"),)
