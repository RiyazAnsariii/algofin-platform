# app/influencer/schemas.py
# Phase INF: Influencer Strategy Engine — Pydantic schemas
#
# Public schemas never include: pine_code, webhook_secret_hash
# Admin schemas include everything.

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


# ── Enums / literals ──────────────────────────────────────────────────────────

SignalAction = Literal["ENTER_LONG", "EXIT_LONG", "ENTER_SHORT", "EXIT_SHORT"]
RiskLevel = Literal["low", "medium", "high"]
StrategyStatus = Literal["draft", "active", "archived"]
SubscriptionStatus = Literal["active", "paused", "stopped"]
ExecutionMode = Literal["DRY_RUN", "LIVE"]


# ── InfluencerStrategy ────────────────────────────────────────────────────────


class InfluencerStrategyCreate(BaseModel):
    """Admin-only: create a new influencer strategy."""

    strategy_code: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    creator_name: str = Field(..., min_length=1, max_length=100)
    creator_avatar_url: str | None = None
    supported_markets: list[str] = Field(default_factory=list)
    recommended_timeframe: str | None = None
    risk_level: RiskLevel = "medium"

    # Performance metadata (static, admin-entered)
    backtested_return: Decimal | None = None
    max_drawdown: Decimal | None = None
    win_rate: Decimal | None = None
    total_trades: int | None = None
    equity_curve: list[Any] = Field(default_factory=list)

    # Pine code — placeholder for now
    pine_code: str | None = None

    # Plain secret — hashed on write, returned once, never stored
    plain_secret: str = Field(..., min_length=16)

    version: str = "1.0"

    @field_validator("strategy_code", mode="before")
    @classmethod
    def upper_code(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("supported_markets", mode="before")
    @classmethod
    def upper_markets(cls, v: list) -> list:
        return [m.upper().strip() for m in v]


class InfluencerStrategyUpdate(BaseModel):
    """Admin-only: patch strategy fields."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None
    creator_name: str | None = None
    creator_avatar_url: str | None = None
    supported_markets: list[str] | None = None
    recommended_timeframe: str | None = None
    risk_level: RiskLevel | None = None
    backtested_return: Decimal | None = None
    max_drawdown: Decimal | None = None
    win_rate: Decimal | None = None
    total_trades: int | None = None
    equity_curve: list[Any] | None = None
    pine_code: str | None = None
    version: str | None = None
    status: StrategyStatus | None = None


class InfluencerStrategyPublicResponse(BaseModel):
    """User-facing: no pine_code, no webhook_secret_hash."""

    id: str
    strategy_code: str
    name: str
    description: str | None
    creator_name: str
    creator_avatar_url: str | None
    supported_markets: list[str]
    recommended_timeframe: str | None
    risk_level: str
    backtested_return: str | None
    max_drawdown: str | None
    win_rate: str | None
    total_trades: int | None
    equity_curve: list[Any]
    status: str
    version: str
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, s) -> "InfluencerStrategyPublicResponse":
        return cls(
            id=str(s.id),
            strategy_code=s.strategy_code,
            name=s.name,
            description=s.description,
            creator_name=s.creator_name,
            creator_avatar_url=s.creator_avatar_url,
            supported_markets=s.supported_markets or [],
            recommended_timeframe=s.recommended_timeframe,
            risk_level=s.risk_level,
            backtested_return=str(s.backtested_return) if s.backtested_return is not None else None,
            max_drawdown=str(s.max_drawdown) if s.max_drawdown is not None else None,
            win_rate=str(s.win_rate) if s.win_rate is not None else None,
            total_trades=s.total_trades,
            equity_curve=s.equity_curve or [],
            status=s.status,
            version=s.version,
            created_at=s.created_at.isoformat(),
            updated_at=s.updated_at.isoformat(),
        )


class InfluencerStrategyAdminResponse(InfluencerStrategyPublicResponse):
    """Admin-facing: includes pine_code and webhook_url."""

    pine_code: str | None
    webhook_url: str | None

    @classmethod
    def from_orm_admin(
        cls, s, webhook_url: str | None = None
    ) -> "InfluencerStrategyAdminResponse":
        base = InfluencerStrategyPublicResponse.from_orm(s)
        return cls(
            **base.model_dump(),
            pine_code=s.pine_code,
            webhook_url=webhook_url,
        )


class RotateSecretResponse(BaseModel):
    """Returned once on secret rotation — plain secret never retrievable again."""

    plain_secret: str
    strategy_id: str
    webhook_url: str
    message: str = (
        "Store this secret immediately. "
        "It will not be shown again. "
        'Add to TradingView alert payload: {"secret": "<value>", "action": "ENTER_LONG", ...}'
    )


# ── InfluencerSubscription ────────────────────────────────────────────────────


class SubscriptionCreate(BaseModel):
    """User subscribes to a strategy."""

    influencer_strategy_id: str
    exchange_account_id: str
    symbol: str = Field(..., min_length=2, max_length=30)
    capital_usdt: Decimal = Field(..., gt=10, description="Position notional in USDT (min $10)")
    leverage: int = Field(default=1, ge=1, le=125)

    @field_validator("symbol", mode="before")
    @classmethod
    def upper_symbol(cls, v: str) -> str:
        return v.upper().strip()


class SubscriptionUpdate(BaseModel):
    """Patch subscription settings."""

    symbol: str | None = None
    capital_usdt: Decimal | None = Field(default=None, gt=10)
    leverage: int | None = Field(default=None, ge=1, le=125)

    @field_validator("symbol", mode="before")
    @classmethod
    def upper_symbol(cls, v: str | None) -> str | None:
        return v.upper().strip() if v else None


class SubscriptionResponse(BaseModel):
    id: str
    user_id: str
    influencer_strategy_id: str
    exchange_account_id: str
    symbol: str
    capital_usdt: str
    leverage: int
    status: str
    created_at: str
    updated_at: str
    # Denormalized from strategy (filled by service)
    strategy_name: str | None = None
    strategy_code: str | None = None

    @classmethod
    def from_orm(cls, sub, strategy=None) -> "SubscriptionResponse":
        return cls(
            id=str(sub.id),
            user_id=str(sub.user_id),
            influencer_strategy_id=str(sub.influencer_strategy_id),
            exchange_account_id=str(sub.exchange_account_id),
            symbol=sub.symbol,
            capital_usdt=str(sub.capital_usdt),
            leverage=sub.leverage,
            status=sub.status,
            created_at=sub.created_at.isoformat(),
            updated_at=sub.updated_at.isoformat(),
            strategy_name=strategy.name if strategy else None,
            strategy_code=strategy.strategy_code if strategy else None,
        )


# ── InfluencerSignal ──────────────────────────────────────────────────────────


class InfluencerSignalResponse(BaseModel):
    id: str
    influencer_strategy_id: str
    action: str
    ticker: str
    price: str | None
    is_test: bool
    execution_mode: str
    status: str
    subscriber_count: int
    received_at: str
    completed_at: str | None

    @classmethod
    def from_orm(cls, sig) -> "InfluencerSignalResponse":
        return cls(
            id=str(sig.id),
            influencer_strategy_id=str(sig.influencer_strategy_id),
            action=sig.action,
            ticker=sig.ticker,
            price=str(sig.price) if sig.price is not None else None,
            is_test=sig.is_test,
            execution_mode=sig.execution_mode,
            status=sig.status,
            subscriber_count=sig.subscriber_count,
            received_at=sig.received_at.isoformat(),
            completed_at=sig.completed_at.isoformat() if sig.completed_at else None,
        )


# ── InfluencerSubscriberExecution ─────────────────────────────────────────────


class SubscriberExecutionResponse(BaseModel):
    id: str
    signal_id: str
    subscription_id: str
    user_id: str
    action: str
    symbol: str
    execution_mode: str
    computed_quantity: str | None
    risk_result: str | None
    order_id: str | None
    status: str
    error: str | None
    execution_latency_ms: int | None
    created_at: str

    @classmethod
    def from_orm(cls, e) -> "SubscriberExecutionResponse":
        return cls(
            id=str(e.id),
            signal_id=str(e.signal_id),
            subscription_id=str(e.subscription_id),
            user_id=str(e.user_id),
            action=e.action,
            symbol=e.symbol,
            execution_mode=e.execution_mode,
            computed_quantity=str(e.computed_quantity) if e.computed_quantity is not None else None,
            risk_result=e.risk_result,
            order_id=str(e.order_id) if e.order_id else None,
            status=e.status,
            error=e.error,
            execution_latency_ms=e.execution_latency_ms,
            created_at=e.created_at.isoformat(),
        )


# ── Admin test signal ─────────────────────────────────────────────────────────


class TestSignalRequest(BaseModel):
    """
    Admin-only: inject a test signal directly into the fan-out pipeline.
    Always DRY_RUN — no real orders placed.
    Each request generates a fresh idempotency key (UUID), so repeated
    clicks always produce new signals (supports iterative testing).
    """

    influencer_strategy_id: str
    action: SignalAction
    ticker: str = Field(..., min_length=2, max_length=30)
    price: Decimal | None = None

    @field_validator("ticker", mode="before")
    @classmethod
    def upper_ticker(cls, v: str) -> str:
        return v.upper().strip()


class TestSignalResponse(BaseModel):
    signal_id: str
    status: str
    message: str


# ── Admin subscriber list ─────────────────────────────────────────────────────


class AdminSubscriberRow(BaseModel):
    subscription_id: str
    user_id: str
    user_email: str | None
    symbol: str
    capital_usdt: str
    leverage: int
    status: str
    created_at: str
