# app/models/strategy.py
# AlgoFin v2 — Phase F: Strategy Engine models
#
# Strategy         — user-defined trading strategy (conditions + order params)
# StrategyExecution — append-only log of every strategy trigger

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, DateTime, Integer, Numeric, String, Text, ForeignKey, func
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UUIDType


class Strategy(Base):
    """
    A user-defined automated trading strategy.

    strategy_type values:
        price_breakout  — fires when symbol price crosses price_level
        manual          — user triggers manually; acts as a saved order template

    status values:
        active   — engine evaluates this strategy on every price tick
        paused   — user paused it; engine skips it
        stopped  — max_executions reached or manually stopped; no longer evaluated

    Order params (stored flat — no JSON blob to keep queries simple):
        exchange_account_id, symbol, order_side, order_type, quantity, limit_price

    price_breakout additional params:
        price_level  — trigger threshold
        direction    — "above" (fire when price >= level) | "below" (price <= level)
    """
    __tablename__ = "strategies"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"), nullable=False
    )

    # ── Identity ──────────────────────────────────────────────────────
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    strategy_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # "price_breakout" | "manual"

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    # "active" | "paused" | "stopped"

    # ── Order parameters ──────────────────────────────────────────────
    symbol: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    order_side: Mapped[str] = mapped_column(String(10), nullable=False)
    # "BUY" | "SELL"
    order_type: Mapped[str] = mapped_column(String(20), nullable=False, default="MARKET")
    # "MARKET" | "LIMIT"
    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    reduce_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # ── price_breakout parameters ─────────────────────────────────────
    price_level: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # "above" | "below"

    # ── Execution limits ──────────────────────────────────────────────
    max_executions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # None = unlimited; 1 = one-shot
    execution_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Timestamps ────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )


class StrategyExecution(Base):
    """Append-only log of every strategy trigger."""
    __tablename__ = "strategy_executions"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType, primary_key=True, default=uuid.uuid4)
    strategy_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("strategies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    trigger_price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    # price at the moment the strategy fired (None for manual)

    order_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # linked order if placement succeeded

    status: Mapped[str] = mapped_column(String(20), nullable=False)
    # "triggered" | "order_placed" | "failed"
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
