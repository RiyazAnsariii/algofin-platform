# app/strategy/schemas.py
# AlgoFin v2 — Phase F: Strategy Engine Pydantic schemas

import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator


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
    quantity: Decimal
    limit_price: Decimal | None = None
    reduce_only: bool = False

    # price_breakout only
    price_level: Decimal | None = None
    direction: Direction | None = None

    # Execution limit
    max_executions: int | None = None   # None = unlimited

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
            last_executed_at=s.last_executed_at.isoformat() if s.last_executed_at else None,
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
