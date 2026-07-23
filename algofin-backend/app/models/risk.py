# app/models/risk.py
# AlgoFin v2 — Phase D: Risk rule and violation log models

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UUIDType


class RiskRule(Base):
    """
    A user-defined risk rule.

    Rule types:
        MAX_DAILY_LOSS     — block orders if today's realized PnL < -threshold (USDT)
        MAX_POSITION_SIZE  — block orders that would push a position above threshold (contracts)
        MAX_OPEN_POSITIONS — block orders if open positions ≥ threshold (count)
        MAX_ORDER_SIZE     — block any single order with quantity > threshold (contracts)

    Actions:
        reject  — silently reject the order with a risk error
        alert   — allow the order but fire a RiskEvent to the frontend
    """

    __tablename__ = "risk_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # MAX_DAILY_LOSS | MAX_POSITION_SIZE | MAX_OPEN_POSITIONS | MAX_ORDER_SIZE

    threshold: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    # Meaning depends on rule_type:
    #   MAX_DAILY_LOSS     → USDT loss limit (positive number; actual loss is negative)
    #   MAX_POSITION_SIZE  → max contracts per symbol
    #   MAX_OPEN_POSITIONS → max count of open positions
    #   MAX_ORDER_SIZE     → max contracts per order

    action: Mapped[str] = mapped_column(String(20), nullable=False, default="reject")
    # "reject" | "alert"

    symbol: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # If set, rule applies only to this symbol. None = all symbols.

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    triggered_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    violations: Mapped[list["RiskViolation"]] = relationship(
        back_populates="rule", cascade="all, delete-orphan"
    )


class RiskViolation(Base):
    """
    Immutable audit log of every time a risk rule triggered.
    Append-only — never updated.
    """

    __tablename__ = "risk_violations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("risk_rules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUIDType, nullable=False, index=True)

    rule_type: Mapped[str] = mapped_column(String(30), nullable=False)
    threshold: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    current_value: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    action_taken: Mapped[str] = mapped_column(String(20), nullable=False)
    # "order_rejected" | "alert_sent"

    symbol: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # The symbol of the blocked/alerted order (if applicable)

    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    rule: Mapped["RiskRule"] = relationship(back_populates="violations")
