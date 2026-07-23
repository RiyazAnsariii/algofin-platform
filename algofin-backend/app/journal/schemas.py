# app/journal/schemas.py
# AlgoFin v2 — Phase G: Journal & Analytics Pydantic schemas

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator


# ── Journal Entry ──────────────────────────────────────────────────────────

MoodType = Literal["confident", "focused", "fearful", "greedy", "neutral"]


class JournalEntryCreate(BaseModel):
    entry_date: date
    title: str = Field(..., max_length=200)
    body: str | None = Field(None, max_length=10000)
    symbol: str | None = Field(None, max_length=20)
    tags: list[str] = Field(default_factory=list, max_length=20)
    mood: MoodType | None = None

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Title is required")
        return v

    @field_validator("symbol", mode="before")
    @classmethod
    def upper_symbol(cls, v):
        return v.upper().strip() if v else None

    @field_validator("tags", mode="before")
    @classmethod
    def clean_tags(cls, v) -> list[str]:
        if isinstance(v, str):
            return [t.strip().lower() for t in v.split(",") if t.strip()]
        if isinstance(v, list):
            return [str(t).strip().lower() for t in v if str(t).strip()]
        return []


class JournalEntryUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    symbol: str | None = None
    tags: list[str] | None = None
    mood: MoodType | None = None


class JournalEntryResponse(BaseModel):
    id: str
    entry_date: str
    title: str
    body: str | None
    symbol: str | None
    tags: list[str]
    mood: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_orm_obj(cls, e) -> "JournalEntryResponse":
        tags = [t.strip() for t in (e.tags or "").split(",") if t.strip()]
        return cls(
            id=str(e.id),
            entry_date=e.entry_date.isoformat(),
            title=e.title,
            body=e.body,
            symbol=e.symbol,
            tags=tags,
            mood=e.mood,
            created_at=e.created_at.isoformat(),
            updated_at=e.updated_at.isoformat(),
        )


# ── Analytics ──────────────────────────────────────────────────────────────


class DailyPnL(BaseModel):
    date: str
    pnl: str
    trade_count: int
    cumulative_pnl: str


class SymbolBreakdown(BaseModel):
    symbol: str
    trade_count: int
    realized_pnl: str
    win_count: int
    loss_count: int
    win_rate: float


class AnalyticsSummary(BaseModel):
    # Period
    period_days: int
    from_date: str
    to_date: str

    # Totals
    total_trades: int
    realized_pnl: str
    total_commission: str
    net_pnl: str  # realized_pnl − commission

    # Performance
    win_count: int
    loss_count: int
    win_rate: float  # 0.0 – 1.0
    profit_factor: float  # gross_profit / abs(gross_loss); 0 if no losses
    avg_win: str
    avg_loss: str
    avg_trade: str

    # Risk metrics
    max_single_win: str
    max_single_loss: str
    best_day_pnl: str
    worst_day_pnl: str

    # Daily PnL series (for chart)
    daily_pnl: list[DailyPnL]

    # Symbol breakdown (top 10 by trade count)
    by_symbol: list[SymbolBreakdown]
