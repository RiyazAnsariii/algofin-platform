# app/models/assistant.py
# AlgoFin v1 — Chat thread and message models
# V1 UX constraints (plan.md Section 6):
#   - One active thread per user. No thread list, no thread sidebar.
#   - chat_threads: one row per user, reused across sessions.
#   - No assistant_context_cache. No assistant_actions table.

import uuid
from datetime import datetime
from sqlalchemy import (
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base, UUIDType


class ChatThread(Base):
    """
    One thread per user. Reused across sessions.
    No thread management UI in v1. plan.md Section 6.
    """

    __tablename__ = "chat_threads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
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

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_chat_thread_user"),
        # Enforces one thread per user at DB level
    )

    # Relationships
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at",
    )


class ChatMessage(Base):
    """
    Individual chat message in the assistant thread.
    Roles: user | assistant | system.
    Tool call metadata stored as JSON text for audit (plan.md Section 6).
    """

    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    thread_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType,
        ForeignKey("chat_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    # "user" | "assistant" | "system"

    content: Mapped[str] = mapped_column(Text, nullable=False)
    tool_calls_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    # JSON-serialised list of tool call records for audit logging.
    # Each record: {tool_name, input, output, latency_ms, timestamp}
    # plan.md Section 6: "Log every tool call: input, output, latency, timestamp"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )

    # Relationships
    thread: Mapped["ChatThread"] = relationship(back_populates="messages")
