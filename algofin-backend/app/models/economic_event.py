# app/models/economic_event.py
# AlgoFin v1 — Economic calendar event model

import uuid
from datetime import datetime
from sqlalchemy import (
    DateTime,
    Integer,
    JSON,
    String,
    UniqueConstraint,
    Index,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base, UUIDType


class EconomicEvent(Base):
    """
    Economic calendar event (e.g. CPI, FOMC, NFP).
    Ingested from external economic calendar providers (e.g. FMP).
    Cached in PostgreSQL for fast user queries, backtesting, and AI explanations.
    """

    __tablename__ = "economic_events"
    __table_args__ = (
        UniqueConstraint(
            "source", "provider_event_id", name="uq_economic_events_source_provider_id"
        ),
        UniqueConstraint("source", "event_hash", name="uq_economic_events_source_hash"),
        Index("idx_econ_events_time_impact_curr", "event_time_utc", "impact", "currency"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUIDType, primary_key=True, default=uuid.uuid4
    )

    source: Mapped[str] = mapped_column(
        String(100), nullable=False, default="FMP", index=True
    )
    provider_event_id: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )
    event_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    impact: Mapped[str] = mapped_column(String(10), nullable=False, index=True)

    event_time_utc: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    actual: Mapped[str | None] = mapped_column(String(100), nullable=True)
    forecast: Mapped[str | None] = mapped_column(String(100), nullable=True)
    previous: Mapped[str | None] = mapped_column(String(100), nullable=True)

    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    revision_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
