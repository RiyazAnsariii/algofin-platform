# app/models/journal.py
# AlgoFin v2 — Phase G: Trade Journal model

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, String, Text, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, UUIDType


class JournalEntry(Base):
    """
    Manual trade journal entry.
    Each entry covers a specific trading date and can reference a symbol.
    Tags are stored as a comma-separated string for simplicity (no join table needed).

    mood values: "confident" | "focused" | "fearful" | "greedy" | "neutral" | None
    """

    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Markdown content — rendered in the UI

    symbol: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Optional: tag entry to a specific symbol (e.g. "BTCUSDT")

    tags: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Comma-separated: "breakout,high-leverage,fomo"

    mood: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # "confident" | "focused" | "fearful" | "greedy" | "neutral"

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
