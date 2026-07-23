# app/strategy/schemas.py
# AlgoFin v2 — Phase F: Strategy Engine Pydantic schemas

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


StrategyType = Literal["price_breakout", "manual"]
StrategyStatus = Literal["active", "paused", "stopped"]
OrderSide = Literal["BUY", "SELL"]
OrderType = Literal["MARKET", "LIMIT"]
Direction = Literal["above", "below"]


# ── Create / Update ────────────────────────────────────────────────────────


class StrategyCreate(BaseModel):
    name: str
    description: str | None = None
    strategy_type: StrategyType
    exchange_account_id: str

    # Order params
    symbol: str
    order_side: OrderSide
    order_type: OrderType = "MARKET"
    quantity: Decimal = Field(..., gt=0)
    limit_price: Decimal | None = None
    reduce_only: bool = False

    # price_breakout only
    price_level: Decimal | None = None
    direction: Direction | None = None

    # Execution limit
    max_executions: int | None = None  # None = unlimited

    @field_validator("symbol", mode="before")
    @classmethod
    def upper_symbol(cls, v: str) -> str:
        return v.upper().strip()

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Strategy name is required")
        return v

    @model_validator(mode="after")
    def validate_type_params(self) -> "StrategyCreate":
        if self.strategy_type == "price_breakout":
            if self.price_level is None:
                raise ValueError("price_breakout requires price_level")
            if self.direction is None:
                raise ValueError("price_breakout requires direction (above/below)")
        if self.order_type == "LIMIT" and self.limit_price is None:
            raise ValueError("LIMIT orders require a limit_price")
        if self.max_executions is not None and self.max_executions < 1:
            raise ValueError("max_executions must be >= 1")
        return self


class StrategyUpdate(BaseModel):
    """Partial update — only status and name/description can be changed after creation."""

    name: str | None = None
    description: str | None = None
    status: StrategyStatus | None = None


# ── Responses ──────────────────────────────────────────────────────────────


class StrategyResponse(BaseModel):
    id: str
    user_id: str
    exchange_account_id: str
    name: str
    description: str | None
    strategy_type: str
    status: str

    symbol: str
    order_side: str
    order_type: str
    quantity: str
    limit_price: str | None
    reduce_only: bool

    price_level: str | None
    direction: str | None

    max_executions: int | None
    execution_count: int
    last_executed_at: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_orm_obj(cls, s) -> "StrategyResponse":
        return cls(
            id=str(s.id),
            user_id=str(s.user_id),
            exchange_account_id=str(s.exchange_account_id),
            name=s.name,
            description=s.description,
            strategy_type=s.strategy_type,
            status=s.status,
            symbol=s.symbol,
            order_side=s.order_side,
            order_type=s.order_type,
            quantity=str(s.quantity),
            limit_price=str(s.limit_price) if s.limit_price is not None else None,
            reduce_only=s.reduce_only,
            price_level=str(s.price_level) if s.price_level is not None else None,
            direction=s.direction,
            max_executions=s.max_executions,
            execution_count=s.execution_count,
            last_executed_at=s.last_executed_at.isoformat()
            if s.last_executed_at
            else None,
            created_at=s.created_at.isoformat(),
            updated_at=s.updated_at.isoformat(),
        )


class StrategyExecutionResponse(BaseModel):
    id: str
    strategy_id: str
    trigger_price: str | None
    order_id: str | None
    status: str
    error: str | None
    executed_at: str

    @classmethod
    def from_orm_obj(cls, e) -> "StrategyExecutionResponse":
        return cls(
            id=str(e.id),
            strategy_id=str(e.strategy_id),
            trigger_price=str(e.trigger_price) if e.trigger_price is not None else None,
            order_id=str(e.order_id) if e.order_id else None,
            status=e.status,
            error=e.error,
            executed_at=e.executed_at.isoformat(),
        )


# ── Phase M: pine_webhook schemas ─────────────────────────────────────────────


class PineWebhookCreate(BaseModel):
    """Request body for creating a pine_webhook strategy (starts in DRAFT)."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    exchange_account_id: str
    symbol: str
    timeframe: str | None = Field(default=None, description="e.g. '1h', '4h', '1D'")
    quantity: Decimal | None = Field(default=None, gt=0)
    reduce_only: bool = False
    max_executions: int | None = Field(default=None, ge=1)

    @field_validator("symbol", mode="before")
    @classmethod
    def upper_symbol(cls, v: str) -> str:
        return v.upper().strip()

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Strategy name is required")
        return v


class PineWebhookResponse(BaseModel):
    id: str
    user_id: str
    exchange_account_id: str
    name: str
    description: str | None
    strategy_type: str
    status: str
    symbol: str
    timeframe: str | None
    quantity: str | None
    reduce_only: bool
    is_test_mode: bool
    current_version: int
    pine_code: str | None
    max_executions: int | None
    execution_count: int
    last_executed_at: str | None
    webhook_url: str | None
    created_at: str
    updated_at: str

    @classmethod
    def from_orm_obj(cls, s, webhook_url: str | None = None) -> "PineWebhookResponse":
        return cls(
            id=str(s.id),
            user_id=str(s.user_id),
            exchange_account_id=str(s.exchange_account_id),
            name=s.name,
            description=s.description,
            strategy_type=s.strategy_type,
            status=s.status,
            symbol=s.symbol,
            timeframe=getattr(s, "timeframe", None),
            quantity=str(s.quantity) if s.quantity is not None else None,
            reduce_only=s.reduce_only,
            is_test_mode=getattr(s, "is_test_mode", False),
            current_version=getattr(s, "current_version", 0),
            pine_code=getattr(s, "pine_code", None),
            max_executions=s.max_executions,
            execution_count=s.execution_count,
            last_executed_at=s.last_executed_at.isoformat()
            if s.last_executed_at
            else None,
            webhook_url=webhook_url,
            created_at=s.created_at.isoformat(),
            updated_at=s.updated_at.isoformat(),
        )


class WebhookSecretResponse(BaseModel):
    """Returned ONCE — never retrievable again."""

    secret: str
    strategy_id: str
    webhook_url: str
    message: str = (
        "Store this secret immediately. "
        'Add it to your TradingView alert: {"secret": "<value>", "action": "{{strategy.order.action}}", ...}'
    )


class SavePineRequest(BaseModel):
    pine_code: str = Field(..., min_length=1)


class PineVersionResponse(BaseModel):
    id: str
    strategy_id: str
    version_number: int
    pine_code: str
    created_at: str

    @classmethod
    def from_orm_obj(cls, v) -> "PineVersionResponse":
        return cls(
            id=str(v.id),
            strategy_id=str(v.strategy_id),
            version_number=v.version_number,
            pine_code=v.pine_code,
            created_at=v.created_at.isoformat(),
        )


class SignalHistoryResponse(BaseModel):
    id: str
    strategy_id: str
    action: str
    ticker: str
    contracts: str | None
    price: str | None
    status: str
    is_test: bool
    error: str | None
    processing_duration_ms: int | None
    received_at: str
    processed_at: str | None

    @classmethod
    def from_orm_obj(cls, s) -> "SignalHistoryResponse":
        return cls(
            id=str(s.id),
            strategy_id=str(s.strategy_id),
            action=s.action,
            ticker=s.ticker,
            contracts=str(s.contracts) if s.contracts is not None else None,
            price=str(s.price) if s.price is not None else None,
            status=s.status,
            is_test=s.is_test,
            error=s.error,
            processing_duration_ms=s.processing_duration_ms,
            received_at=s.received_at.isoformat(),
            processed_at=s.processed_at.isoformat() if s.processed_at else None,
        )


class ExecutionHistoryResponse(BaseModel):
    id: str
    signal_id: str
    strategy_id: str
    risk_result: str
    order_id: str | None
    execution_latency_ms: int | None
    created_at: str

    @classmethod
    def from_orm_obj(cls, e) -> "ExecutionHistoryResponse":
        return cls(
            id=str(e.id),
            signal_id=str(e.signal_id),
            strategy_id=str(e.strategy_id),
            risk_result=e.risk_result,
            order_id=str(e.order_id) if e.order_id else None,
            execution_latency_ms=e.execution_latency_ms,
            created_at=e.created_at.isoformat(),
        )
