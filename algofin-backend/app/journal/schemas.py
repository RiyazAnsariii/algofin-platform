# app/journal/schemas.py
# AlgoFin v2 — Phase G: Journal & Analytics Pydantic schemas

from datetime import date
from typing import Literal
from pydantic import BaseModel, Field, field_validator


# ── Journal Entry CRUD Schemas ───────────────────────────────────────────────

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


# ── Analytics Schemas ─────────────────────────────────────────────────────────

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


class JournalSummary(BaseModel):
    total_trades: int = 0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    net_pnl: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    best_day: float = 0.0
    worst_day: float = 0.0


class CumulativePnLPoint(BaseModel):
    date: str
    daily_realized_pnl: float
    running_total: float


class WinLossRatio(BaseModel):
    wins: int = 0
    losses: int = 0
    win_percent: float = 0.0
    loss_percent: float = 0.0


class TradePerformancePoint(BaseModel):
    trade_number: int
    realized_pnl: float


class PnLDistributionBucket(BaseModel):
    range: str
    count: int = 0


class JournalAnalyticsResponse(BaseModel):
    summary: JournalSummary
    cumulative_pnl: list[CumulativePnLPoint] = Field(default_factory=list)
    win_loss_ratio: WinLossRatio
    trade_performance: list[TradePerformancePoint] = Field(default_factory=list)
    pnl_distribution: list[PnLDistributionBucket] = Field(default_factory=list)

    # Top-level backwards compatibility fields for existing frontend (journal/page.tsx)
    period_days: int = 30
    from_date: str = ""
    to_date: str = ""
    total_trades: int = 0
    realized_pnl: str = "0"
    total_commission: str = "0"
    net_pnl: str = "0"
    win_count: int = 0
    loss_count: int = 0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    avg_win: str = "0"
    avg_loss: str = "0"
    avg_trade: str = "0"
    max_single_win: str = "0"
    max_single_loss: str = "0"
    best_day_pnl: str = "0"
    worst_day_pnl: str = "0"
    daily_pnl: list[DailyPnL] = Field(default_factory=list)
    by_symbol: list[SymbolBreakdown] = Field(default_factory=list)
