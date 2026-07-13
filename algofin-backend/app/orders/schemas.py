# app/orders/schemas.py
# AlgoFin v2 — Phase B: Order Pydantic schemas

from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# ── Order types supported (Binance USDT-M Futures) ───────────────────────────
OrderType = Literal["MARKET", "LIMIT", "STOP_MARKET", "TAKE_PROFIT_MARKET"]
OrderSide = Literal["BUY", "SELL"]
TimeInForce = Literal["GTC", "IOC", "FOK", "GTX"]
OrderStatus = Literal["NEW", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED", "REJECTED"]


# ── Request schemas ───────────────────────────────────────────────────────────
class PlaceOrderRequest(BaseModel):
    exchange_account_id: UUID = Field(..., description="Which connected Binance account to use")
    symbol: str = Field(..., min_length=2, max_length=30, description="e.g. BTCUSDT")
    side: OrderSide
    order_type: OrderType
    quantity: Decimal = Field(..., gt=0, description="Contract quantity")
    price: Optional[Decimal] = Field(None, gt=0, description="Required for LIMIT orders")
    reduce_only: bool = Field(False, description="Close-only order — will not increase position size")
    time_in_force: Optional[TimeInForce] = Field("GTC", description="Required for LIMIT orders")

    @model_validator(mode="after")
    def validate_limit_fields(self) -> "PlaceOrderRequest":
        if self.order_type == "LIMIT":
            if self.price is None:
                raise ValueError("price is required for LIMIT orders")
            if self.time_in_force is None:
                raise ValueError("time_in_force is required for LIMIT orders")
        return self

    model_config = {"json_schema_extra": {
        "example": {
            "exchange_account_id": "uuid-here",
            "symbol": "BTCUSDT",
            "side": "BUY",
            "order_type": "LIMIT",
            "quantity": "0.01",
            "price": "60000.00",
            "reduce_only": False,
            "time_in_force": "GTC",
        }
    }}


class CancelOrderRequest(BaseModel):
    exchange_account_id: UUID
    symbol: str = Field(..., min_length=2, max_length=30)
    # binance_order_id from the order list


class AmendOrderRequest(BaseModel):
    """Modify price and/or quantity of an open LIMIT order."""
    exchange_account_id: UUID
    symbol: str = Field(..., min_length=2, max_length=30)
    new_price: Optional[Decimal] = Field(None, gt=0)
    new_quantity: Optional[Decimal] = Field(None, gt=0)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "AmendOrderRequest":
        if self.new_price is None and self.new_quantity is None:
            raise ValueError("At least one of new_price or new_quantity must be provided")
        return self


# ── Response schemas ──────────────────────────────────────────────────────────
class OrderOut(BaseModel):
    id: UUID
    exchange_account_id: UUID
    binance_order_id: Optional[str]
    client_order_id: Optional[str]
    symbol: str
    side: str
    order_type: str
    quantity: Decimal
    price: Optional[Decimal]
    reduce_only: bool
    time_in_force: Optional[str]
    status: str
    filled_quantity: Decimal
    avg_fill_price: Optional[Decimal]
    error_message: Optional[str]
    placed_at: str
    updated_at: str
    filled_at: Optional[str]
    cancelled_at: Optional[str]

    model_config = {"from_attributes": True}
