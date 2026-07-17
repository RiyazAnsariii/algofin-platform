# app/models/exchange.py
# AlgoFin v1 — Exchange account, credentials, billing consent, sync runs

import uuid
from datetime import datetime
from sqlalchemy import (
    UUID,
    Boolean,
    DateTime,
    Integer,
    String,
    Text,
    ForeignKey,
    func,
    CheckConstraint,
    UniqueConstraint,
)

from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class UserExchangeAccount(Base):
    """
    Represents a connected exchange account.
    v1: Binance USDT-M Futures only (exchange_id = "binance_usdtm").

    billing_consent DUAL-RECORD RULE (plan.md Section 3):
      - billing_consent column = current active consent state (boolean)
      - billing_consent_at     = timestamp of most recent consent change
      - exchange_billing_consents table = append-only audit trail
      Never use exchange_billing_consents for current state.
      Never use this column as audit trail. Both must be updated atomically.
    """
    __tablename__ = "user_exchange_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exchange_id: Mapped[str] = mapped_column(
        String(50), nullable=False, default="binance_usdtm"
    )
    # v1: only "binance_usdtm" is supported

    label: Mapped[str] = mapped_column(String(255), nullable=False)

    # Sync state
    sync_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )
    # values: pending | connected | syncing | error | stale
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Billing consent (current state — see dual-record rule above)
    billing_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    billing_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "sync_status IN ('pending','connected','syncing','error','stale')",
            name="ck_exchange_account_sync_status",
        ),
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="exchange_accounts")  # type: ignore[name-defined]
    credentials: Mapped["EncryptedApiCredential | None"] = relationship(
        back_populates="exchange_account", uselist=False, cascade="all, delete-orphan"
    )
    billing_consents: Mapped[list["ExchangeBillingConsent"]] = relationship(
        back_populates="exchange_account", cascade="all, delete-orphan"
    )
    sync_runs: Mapped[list["ExchangeSyncRun"]] = relationship(
        back_populates="exchange_account", cascade="all, delete-orphan"
    )
    balances: Mapped[list["Balance"]] = relationship(  # type: ignore[name-defined]
        back_populates="exchange_account", cascade="all, delete-orphan"
    )
    positions: Mapped[list["Position"]] = relationship(  # type: ignore[name-defined]
        back_populates="exchange_account", cascade="all, delete-orphan"
    )
    trades: Mapped[list["Trade"]] = relationship(  # type: ignore[name-defined]
        back_populates="exchange_account", cascade="all, delete-orphan"
    )
    orders: Mapped[list["Order"]] = relationship(  # type: ignore[name-defined]  # v2 Phase B
        back_populates="exchange_account", cascade="all, delete-orphan"
    )


class EncryptedApiCredential(Base):
    """
    Encrypted Binance API key + secret.
    Encrypted at rest using Fernet (AES-256-CBC).
    Only the backend decrypts credentials during sync jobs.
    Frontend NEVER sees raw API keys.
    plan.md Section 4.
    """
    __tablename__ = "encrypted_api_credentials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    # Fernet-encrypted values (base64url strings)
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_api_secret: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_passphrase: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    exchange_account: Mapped["UserExchangeAccount"] = relationship(back_populates="credentials")


class ExchangeBillingConsent(Base):
    """
    Append-only audit trail of every billing consent grant, revocation,
    or version change. This is NOT the source of truth for current consent —
    use user_exchange_accounts.billing_consent for that.

    Dual-record rule: both this table AND user_exchange_accounts.billing_consent
    must be updated atomically on any consent change. plan.md Section 3.
    """
    __tablename__ = "exchange_billing_consents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    consent_granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    # true = consent granted, false = consent revoked

    consent_version: Mapped[str] = mapped_column(String(20), nullable=False, default="v1.0")
    # version of the consent text shown to the user

    consented_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    exchange_account: Mapped["UserExchangeAccount"] = relationship(back_populates="billing_consents")


class ExchangeSyncRun(Base):
    """
    Ledger of every sync job run. REQUIRED before first deploy.
    plan.md Section 3 — exchange_sync_runs spec.
    plan.md Part 0-A — exchange_sync_runs table is required before deploy.
    """
    __tablename__ = "exchange_sync_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    exchange_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_exchange_accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sync_type: Mapped[str] = mapped_column(String(30), nullable=False)
    # balances | positions | trades | full

    status: Mapped[str] = mapped_column(String(20), nullable=False)
    # running | success | error | partial

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rows_processed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    triggered_by: Mapped[str] = mapped_column(String(30), nullable=False, default="scheduler")
    # scheduler | manual | webhook

    __table_args__ = (
        CheckConstraint(
            "sync_type IN ('balances','positions','trades','full')",
            name="ck_sync_run_type",
        ),
        CheckConstraint(
            "status IN ('running','success','error','partial')",
            name="ck_sync_run_status",
        ),
        CheckConstraint(
            "triggered_by IN ('scheduler','manual','webhook')",
            name="ck_sync_run_triggered_by",
        ),
    )

    # Relationships
    exchange_account: Mapped["UserExchangeAccount"] = relationship(back_populates="sync_runs")
