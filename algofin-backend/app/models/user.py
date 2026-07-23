# app/models/user.py
# AlgoFin v1 — User, RefreshToken, LoginActivity models

import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean,
    DateTime,
    String,
    Text,
    ForeignKey,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base, UUIDType


class User(Base):
    """
    Core user account.
    v1: email + password auth. Google OAuth supported.
    Role: user | admin.
    """

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    hashed_password: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )  # None for OAuth-only users
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    # role values: "user" | "admin"

    # Google OAuth fields
    google_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True
    )
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

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

    # Relationships
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    login_activity: Mapped[list["LoginActivity"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    exchange_accounts: Mapped[list["UserExchangeAccount"]] = relationship(  # type: ignore[name-defined] # noqa: F821
        back_populates="user", cascade="all, delete-orphan"
    )


class RefreshToken(Base):
    """
    Stored refresh tokens for token rotation.
    On use: old token is invalidated, new token issued.
    plan.md Section 4-A.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    # We store a hash of the raw token — never the raw token itself.

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class LoginActivity(Base):
    """
    Security log of login events.
    plan.md Section 4 — security visibility.
    """

    __tablename__ = "login_activity"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event: Mapped[str] = mapped_column(String(50), nullable=False)
    # event values: "login_success" | "login_failed" | "logout" | "token_refreshed" | "password_changed"

    ip_address: Mapped[str | None] = mapped_column(
        String(45), nullable=True
    )  # IPv4 or IPv6
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(back_populates="login_activity")
