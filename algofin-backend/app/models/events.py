# app/models/events.py
# AlgoFin v1 — Economic calendar event model
# This is an ECONOMIC CALENDAR — NOT a news feed.
# Label: "Economic Calendar" / "Upcoming High-Impact Events" / "Market Events"
# NEVER: "News Feed", "Live Market Intelligence" (plan.md Section 7)

import uuid
from datetime import datetime
from sqlalchemy import (
    DateTime,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base, UUIDType


class EconomicEvent(Base):
    """
    Economic calendar event (e.g. CPI, FOMC, NFP).
    Ingested from external economic calendar source.
    No news_items table in v1 — only structured economic events.
    plan.md Section 7.
    """
    __tablename__ = "economic_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, index=True)
    # Unique ID from the source (for deduplication on re-fetch)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    # e.g. "USD", "EUR", "CNY"
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g. "United States"

    impact: Mapped[str] = mapped_column(String(10), nullable=False)
    # "low" | "medium" | "high"

    event_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    forecast: Mapped[str | None] = mapped_column(String(100), nullable=True)
    previous: Mapped[str | None] = mapped_column(String(100), nullable=True)
    actual: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # actual is null until the event has occurred and result is published

    source: Mapped[str] = mapped_column(String(100), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
