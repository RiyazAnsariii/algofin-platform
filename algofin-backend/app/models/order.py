# app/models/order.py
# AlgoFin v2 — Phase B: Order model (Binance USDT-M Futures)
#
# Stores every order placed through AlgoFin.
# Order status lifecycle: NEW → PARTIALLY_FILLED → FILLED | CANCELLED | EXPIRED
# These events are streamed live in Phase C.

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, UUIDType


class Order(Base):
    """
    Binance USDT-M Futures order placed through AlgoFin.

    Statuses:
        NEW              — submitted to Binance, awaiting fill
        PARTIALLY_FILLED — partially filled
        FILLED           — fully filled
        CANCELLED        — cancelled by user or system
        EXPIRED          — GTX/time-in-force expired
        REJECTED         — Binance rejected the order
    """

    __tablename__ = "orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Exchange-side identifiers ─────────────────────────────────────
    binance_order_id: Mapped[str | None] = mapped_column(
        String(50), nullable=True, index=True
    )
    client_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # ── Order details ─────────────────────────────────────────────────
    symbol: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    # "BUY" | "SELL"

    order_type: Mapped[str] = mapped_column(String(20), nullable=False)
    # "MARKET" | "LIMIT" | "STOP_MARKET" | "TAKE_PROFIT_MARKET"

    quantity: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    price: Mapped[Decimal | None] = mapped_column(Numeric(20, 8), nullable=True)
    # None for MARKET orders

    reduce_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    time_in_force: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # "GTC" | "IOC" | "FOK" | "GTX"

    # ── Fill state ────────────────────────────────────────────────────
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="NEW")
    filled_quantity: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), nullable=False, default=0
    )
    avg_fill_price: Mapped[Decimal | None] = mapped_column(
        Numeric(20, 8), nullable=True
    )

    # ── Metadata ──────────────────────────────────────────────────────
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Populated if status=REJECTED

    placed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    filled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ─────────────────────────────────────────────────
    exchange_account: Mapped["UserExchangeAccount"] = relationship(  # noqa: F821
        back_populates="orders"
    )  # type: ignore[name-defined]
