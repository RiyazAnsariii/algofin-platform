# app/models/alert.py
# AlgoFin v2 — Phase E: Alert models
#
# TelegramConfig  — one per user (bot token + chat ID, encrypted)
# AlertRule       — which event types trigger an alert for this user
# AlertDelivery   — append-only audit log of every sent/failed message

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
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UUIDType


class TelegramConfig(Base):
    """
    One Telegram bot configuration per user.
    bot_token is encrypted at rest (Fernet — same as exchange credentials).
    """

    __tablename__ = "telegram_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    chat_id: Mapped[str] = mapped_column(String(100), nullable=False)
    # Telegram bot token — Fernet-encrypted, stored as base64url string
    bot_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AlertRule(Base):
    """
    Defines which event types trigger a Telegram alert for a user.

    alert_type values:
        ORDER_FILLED     — order fully filled
        ORDER_CANCELLED  — order cancelled
        ORDER_REJECTED   — order rejected by exchange
        RISK_TRIGGERED   — risk rule fired (reject or alert action)
        PRICE_ALERT      — price crosses threshold (requires symbol + threshold + direction)
    """

    __tablename__ = "alert_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    alert_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # "ORDER_FILLED" | "ORDER_CANCELLED" | "ORDER_REJECTED" | "RISK_TRIGGERED" | "PRICE_ALERT"

    # PRICE_ALERT only fields
    symbol: Mapped[str | None] = mapped_column(String(30), nullable=True)
    threshold: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # direction: "above" | "below"

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    triggered_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_triggered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AlertDelivery(Base):
    """Append-only log of every Telegram message attempt."""

    __tablename__ = "alert_deliveries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType, nullable=True)
    # null for system alerts (e.g. price alerts triggered from market data)

    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
