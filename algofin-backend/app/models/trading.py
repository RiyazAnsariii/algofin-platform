# app/models/trading.py
# AlgoFin v1 — Balance, Position, Trade models (Binance USDT-M Futures)

import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import (
    DateTime,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base, UUIDType


class Balance(Base):
    """
    Binance USDT-M Futures account balance snapshot.
    Upserted on each balance sync.
    """

    __tablename__ = "balances"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    # "USDT" for USDT-M Futures

    wallet_balance: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), nullable=False, default=0
    )
    # unrealized_pnl: display only — NEVER included in billing (plan.md Section 5-A)
    margin_balance: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), nullable=False, default=0
    )
    available_balance: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), nullable=False, default=0
    )
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "exchange_account_id", "asset", name="uq_balance_account_asset"
        ),
    )

    # Relationships
    exchange_account: Mapped["UserExchangeAccount"] = relationship(  # noqa: F821
        back_populates="balances"
    )  # type: ignore[name-defined]


class Position(Base):
    """
    Open Binance USDT-M Futures position.
    Replaced on each positions sync (not appended).
    unrealized_pnl is stored for display only — EXCLUDED from billing.
    """

    __tablename__ = "positions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    side: Mapped[str] = mapped_column(String(10), nullable=False)
    # "long" | "short"

    size: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    mark_price: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), nullable=False, default=0
    )
    unrealized_pnl: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), nullable=False, default=0
    )
    # Display only — NEVER used in billing. plan.md Section 5-A.

    leverage: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    margin_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="cross"
    )
    # "isolated" | "cross"

    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "exchange_account_id",
            "symbol",
            "side",
            name="uq_position_account_symbol_side",
        ),
    )

    # Relationships
    exchange_account: Mapped["UserExchangeAccount"] = relationship(  # noqa: F821
        back_populates="positions"
    )  # type: ignore[name-defined]


class Trade(Base):
    """
    Binance USDT-M Futures trade history (fill-level).

    BILLING CRITICAL:
      realized_pnl uses the realizedPnl field from Binance API directly.
      Do NOT deduct trading fees — Binance reports PnL net of fees (plan.md Section 5-A).
      Funding payments are NOT included — they are excluded from billing.
      Only closing trades contribute to billing PnL.

    plan.md Section 5-A — Billing PnL Definition (locked).
    """

    __tablename__ = "trades"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Binance fill-level IDs
    binance_trade_id: Mapped[str] = mapped_column(String(50), nullable=False)
    order_id: Mapped[str] = mapped_column(String(50), nullable=False)
    symbol: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    side: Mapped[str] = mapped_column(String(10), nullable=False)
    # "buy" | "sell"

    price: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), nullable=False, default=0
    )
    # From Binance API realizedPnl field. Used for billing. Do NOT re-derive.

    commission: Mapped[Decimal] = mapped_column(
        Numeric(20, 8), nullable=False, default=0
    )
    commission_asset: Mapped[str] = mapped_column(
        String(20), nullable=False, default="USDT"
    )
    # Commission is stored for transparency — NOT deducted in billing calculation.

    is_maker: Mapped[bool | None] = mapped_column(nullable=True)
    trade_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "exchange_account_id",
            "binance_trade_id",
            name="uq_trade_account_binance_id",
        ),
    )

    # Relationships
    exchange_account: Mapped["UserExchangeAccount"] = relationship(  # noqa: F821
        back_populates="trades"
    )  # type: ignore[name-defined]
