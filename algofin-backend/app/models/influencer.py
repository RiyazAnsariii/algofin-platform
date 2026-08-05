# app/models/influencer.py
# AlgoFin — Phase INF: Influencer Strategy Engine models
#
# Tables:
#   InfluencerStrategy           — admin-managed strategy template (Pine code stored but never exposed)
#   InfluencerSubscription       — per-user subscription with individual capital/risk settings
#   InfluencerSignal             — immutable record of every incoming signal (TV or admin test)
#   InfluencerSubscriberExecution— per-subscriber execution result for each signal

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    JSON,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UUIDType


# ── InfluencerStrategy ────────────────────────────────────────────────────────


class InfluencerStrategy(Base):
    """
    Admin-managed strategy template.

    Pine code is stored here but NEVER returned in user-facing API responses.
    The webhook_secret_hash is a bcrypt hash — the plain secret is shown once
    on creation/rotation and never stored.

    status values:
        draft    — not yet published; invisible to users
        active   — visible in marketplace; accepts webhook signals
        archived — permanently inactive; hidden from marketplace
    """

    __tablename__ = "influencer_strategies"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )

    # ── Identity ──────────────────────────────────────────────────────────────
    strategy_code: Mapped[str] = mapped_column(
        String(20), nullable=False, unique=True
    )
    # Human-readable unique code, e.g. "INF_001". Set once, never changed.

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Creator ───────────────────────────────────────────────────────────────
    creator_name: Mapped[str] = mapped_column(String(100), nullable=False)
    creator_avatar_url: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )

    # ── Market metadata ───────────────────────────────────────────────────────
    supported_markets: Mapped[list | None] = mapped_column(
        JSON, nullable=True, default=list
    )
    # e.g. ["BTCUSDT", "ETHUSDT"]
    recommended_timeframe: Mapped[str | None] = mapped_column(
        String(10), nullable=True
    )
    # e.g. "15m", "1h", "4h", "1D"
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    # "low" | "medium" | "high"

    # ── Performance metadata (admin-entered, static for MVP) ──────────────────
    backtested_return: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 2), nullable=True
    )
    # Percentage, e.g. 142.50 means +142.50%
    max_drawdown: Mapped[Decimal | None] = mapped_column(
        Numeric(8, 2), nullable=True
    )
    # Percentage, e.g. 18.30 means -18.30%
    win_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    # Percentage, e.g. 63.00 means 63% winning trades
    total_trades: Mapped[int | None] = mapped_column(Integer, nullable=True)
    equity_curve: Mapped[list | None] = mapped_column(
        JSON, nullable=True, default=list
    )
    # Time-series array for equity curve chart. [] placeholder until admin populates.
    # Format: [{"t": "2024-01-01", "v": 10000}, ...]

    # ── Pine Script (protected) ───────────────────────────────────────────────
    pine_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Placeholder for now. NEVER serialized in user-facing responses.

    # ── Webhook auth ──────────────────────────────────────────────────────────
    webhook_secret_hash: Mapped[str | None] = mapped_column(
        String(128), nullable=True
    )
    # bcrypt hash of the plain webhook secret. Plain is shown once and never stored.

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    # "draft" | "active" | "archived"
    version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0")

    # ── Ownership ─────────────────────────────────────────────────────────────
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUIDType,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    # SET NULL so strategy survives admin account deletion

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


# ── InfluencerSubscription ────────────────────────────────────────────────────


class InfluencerSubscription(Base):
    """
    A user's subscription to an influencer strategy.

    Each row represents one (user, strategy, exchange_account, symbol) combination.
    The UNIQUE constraint allows the same user to subscribe to INF_001 on both
    BTCUSDT and ETHUSDT, or on two different exchange accounts — each as a
    separate subscription row with its own capital/leverage settings.

    capital_usdt = position notional (not margin).
    quantity = capital_usdt / mark_price  (computed at execution time by fanout worker).
    leverage affects required margin on the exchange only — never touches quantity.

    status values:
        active  — included in fan-out; receives signals
        paused  — excluded from fan-out query; no execution records written
        stopped — permanently inactive; excluded from fan-out
    """

    __tablename__ = "influencer_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    influencer_strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("influencer_strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ── Trading settings (per-subscriber) ────────────────────────────────────
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    # e.g. "BTCUSDT" — uppercased on write
    capital_usdt: Mapped[Decimal] = mapped_column(Numeric(20, 2), nullable=False)
    # Position notional in USDT. quantity = capital_usdt / mark_price.
    leverage: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # 1–125. Sets margin requirement on exchange; does NOT change quantity formula.

    # ── Lifecycle ─────────────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # "active" | "paused" | "stopped"
    # Worker fan-out query loads ONLY status='active'. Paused/stopped are invisible to fan-out.

    # ── Timestamps ────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "influencer_strategy_id",
            "exchange_account_id",
            "symbol",
            name="uq_inf_sub_user_strategy_account_symbol",
        ),
        # Fast fan-out lookup: find all active subscribers for a strategy
        Index(
            "ix_inf_sub_strategy_status",
            "influencer_strategy_id",
            "status",
        ),
    )


# ── InfluencerSignal ──────────────────────────────────────────────────────────


class InfluencerSignal(Base):
    """
    Immutable record of every incoming signal for an influencer strategy.

    Signals arrive from two sources:
        - TradingView webhook (is_test=False, execution_mode="LIVE")
        - Admin "Send Test Signal" button (is_test=True, execution_mode="DRY_RUN")

    Admin test signals use a fresh UUID as idempotency_key per click, so
    repeated test clicks always generate new signals (intentional — supports
    iterative testing without code changes).

    TradingView signals use SHA256(strategy_id + action + ticker + tv_timestamp_unix)
    as idempotency_key, enforcing deduplication within the replay window.

    action values: ENTER_LONG | EXIT_LONG | ENTER_SHORT | EXIT_SHORT
    (not BUY/SELL — the fan-out worker maps to Binance side+reduce_only)

    status state machine:
        QUEUED → FANNING_OUT → COMPLETED (terminal)
                             → FAILED    (terminal)
    """

    __tablename__ = "influencer_signals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    influencer_strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("influencer_strategies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Signal payload ────────────────────────────────────────────────────────
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    # "ENTER_LONG" | "EXIT_LONG" | "ENTER_SHORT" | "EXIT_SHORT"
    ticker: Mapped[str] = mapped_column(String(30), nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    # Optional price hint from TradingView — not used for order pricing (MARKET orders)
    tv_timestamp: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # {{timenow}} from TradingView — used for replay detection on real signals

    # ── Deduplication ─────────────────────────────────────────────────────────
    idempotency_key: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True
    )
    # Admin test: fresh UUID per click (no dedup intended)
    # TradingView: SHA256(strategy_id + action + ticker + tv_timestamp_unix)

    # ── Source metadata ───────────────────────────────────────────────────────
    sender_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    execution_mode: Mapped[str] = mapped_column(
        String(10), nullable=False, default="DRY_RUN"
    )
    # "DRY_RUN" | "LIVE"
    # DRY_RUN: full pipeline (risk, quantity) runs but no real order is placed.
    # LIVE: real exchange order placed (used by TradingView signals in INF+1).

    # ── Processing state ──────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="QUEUED")
    # "QUEUED" | "FANNING_OUT" | "COMPLETED" | "FAILED"
    subscriber_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Set after fan-out completes. 0 means no active subscribers at signal time.

    # ── Timestamps ────────────────────────────────────────────────────────────
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        Index(
            "ix_inf_signal_strategy_received",
            "influencer_strategy_id",
            "received_at",
        ),
        Index("ix_inf_signal_status_received", "status", "received_at"),
    )


# ── InfluencerSubscriberExecution ─────────────────────────────────────────────


class InfluencerSubscriberExecution(Base):
    """
    Per-subscriber execution result for a single InfluencerSignal.

    One row per (signal, subscription) pair.
    UNIQUE(signal_id, subscription_id) prevents double-writes on retry.

    Status values:
        DRY_RUN_OK          — DRY_RUN mode: pipeline passed, no order sent
        ORDER_SUBMITTED     — LIVE mode: order placed on exchange
        RISK_BLOCKED        — Risk engine blocked the order
        PRICE_UNAVAILABLE   — Mark price missing from Redis; execution skipped
        QUANTITY_TOO_SMALL  — Computed qty < symbol minQty filter
        BELOW_MIN_NOTIONAL  — Computed qty × price < symbol minNotional filter
        FAILED              — Unexpected error during execution

    computed_quantity is required for DRY_RUN_OK status.
    It is the result of normalize_quantity() in quantity.py:
        raw_qty = capital_usdt / mark_price
        qty     = round_down(raw_qty, stepSize)
        validate: qty >= minQty, qty * price >= minNotional
    """

    __tablename__ = "influencer_subscriber_executions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    signal_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("influencer_signals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("influencer_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── What was attempted ────────────────────────────────────────────────────
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    execution_mode: Mapped[str] = mapped_column(String(10), nullable=False)
    # "DRY_RUN" | "LIVE" — copied from signal at execution time

    # ── Quantity calculation result ───────────────────────────────────────────
    computed_quantity: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    # Required for DRY_RUN_OK. NULL for PRICE_UNAVAILABLE / filter failures.
    # Formula: normalize_quantity(capital_usdt / mark_price, symbol_filters)

    # ── Risk result ───────────────────────────────────────────────────────────
    risk_result: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # "PASS" | "BLOCK" | None (if skipped before risk check)
    risk_rule_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # FK to risk rule that blocked (if risk_result == "BLOCK")

    # ── Outcome ───────────────────────────────────────────────────────────────
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # NULL for DRY_RUN. Set when LIVE order is submitted.
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ── Latency ───────────────────────────────────────────────────────────────
    execution_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Time from worker dequeue to this execution row write

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "signal_id",
            "subscription_id",
            name="uq_inf_exec_signal_subscription",
        ),
        # Per-user execution history (subscription page)
        Index("ix_inf_exec_user_created", "user_id", "created_at"),
    )
