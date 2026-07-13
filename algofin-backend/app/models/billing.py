# app/models/billing.py
# AlgoFin v1 — Billing models
# FIELD NAMES ARE LOCKED — do not alias or rename (plan.md Section 5-A).
#
# ✓ total_realized_pnl      (NOT net_realized_pnl)
# ✓ performance_fee_rate    (NOT estimated_fee_rate)
# ✓ performance_fee_amount  (NOT estimated_fee_amount)
# ✗ NO high_water_mark column — does not exist in v1
# ✗ NO accounts_included array — query exchange_billing_consents instead
# ✗ NO performance_fee_records — correct name is billing_period_records

import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base, UUIDType


class UserProfitPeriod(Base):
    """
    Per-user, per-calendar-month billing period.
    Covers all consented exchange accounts for the user.
    No high-water mark. Each month is independent. plan.md Section 5.

    total_realized_pnl = SUM(billing_period_records.account_realized_pnl)
                         for this period. Always derive from records.

    status values:
      open        — period in progress (current month)
      estimated   — month ended, fee calculated, not yet acknowledged
      acknowledged — user has seen the estimate
      paid        — fee settled (future — not collected in v1 beta)
      waived      — fee waived (e.g. data_complete=false periods)
      incomplete  — sync data was missing; fee not finalised
    """
    __tablename__ = "user_profit_periods"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    # Locked field names — plan.md Section 5-A
    total_realized_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False, default=0)
    # net realized PnL across all consented accounts for the period
    # = SUM(billing_period_records.account_realized_pnl) — never store independently

    performance_fee_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), nullable=False, default=Decimal("0.20"))
    # 0.20 = 20%. May change per user in future but not in v1.

    performance_fee_amount: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False, default=0)
    # max(0, total_realized_pnl) * performance_fee_rate
    # Zero if total_realized_pnl <= 0 (no fee in loss months)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "period_start", name="uq_profit_period_user_start"),
        CheckConstraint(
            "status IN ('open','estimated','acknowledged','paid','waived','incomplete')",
            name="ck_profit_period_status",
        ),
    )

    # Relationships
    billing_records: Mapped[list["BillingPeriodRecord"]] = relationship(
        back_populates="profit_period", cascade="all, delete-orphan"
    )


class BillingPeriodRecord(Base):
    """
    Per-account billing contribution row for a given billing period.
    Audit rows — NOT invoices, NOT payment demands.

    account_realized_pnl = sum of qualifying realized PnL for this account
                           in this period. See plan.md Section 5-A for rules.

    data_complete = false if any sync run failed during the period.
    If any record has data_complete=false, the period status = 'incomplete'.

    NO fee_amount column here — the fee is computed at UserProfitPeriod level only.
    plan.md Section 3 — billing_period_records spec.
    """
    __tablename__ = "billing_period_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    profit_period_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("user_profit_periods.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("user_exchange_accounts.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id"), nullable=False
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)

    account_realized_pnl: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False, default=0)
    # sum of qualifying realized PnL for this account in this period
    # See plan.md Section 5-A for inclusion/exclusion rules

    data_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # false if any sync run for this account failed during the period
    # period is not finalised if any contributing record has data_complete=false

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "profit_period_id", "exchange_account_id",
            name="uq_billing_record_period_account",
        ),
    )

    # Relationships
    profit_period: Mapped["UserProfitPeriod"] = relationship(back_populates="billing_records")
