# app/alerts/schemas.py
# AlgoFin v2 — Phase E: Alert Pydantic schemas

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, field_validator


# ── Telegram Config ────────────────────────────────────────────────────────

class TelegramConfigCreate(BaseModel):
    """Request body for saving / updating Telegram config."""
    bot_token: str
    chat_id: str

    @field_validator("bot_token")
    @classmethod
    def token_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("bot_token is required")
        return v

    @field_validator("chat_id")
    @classmethod
    def chat_id_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("chat_id is required")
        return v


class TelegramConfigResponse(BaseModel):
    """Response — bot_token is NEVER returned to client, only masked."""
    id: str
    chat_id: str
    bot_token_masked: str   # e.g.  "123456:ABC***XYZ"
    is_active: bool
    created_at: str

    model_config = {"from_attributes": True}


# ── Alert Rules ────────────────────────────────────────────────────────────

VALID_ALERT_TYPES = Literal[
    "ORDER_FILLED",
    "ORDER_CANCELLED",
    "ORDER_REJECTED",
    "RISK_TRIGGERED",
    "PRICE_ALERT",
]


class AlertRuleCreate(BaseModel):
    alert_type: VALID_ALERT_TYPES

    # PRICE_ALERT only
    symbol:    str | None    = None
    threshold: Decimal | None = None
    direction: Literal["above", "below"] | None = None

    @field_validator("symbol", mode="before")
    @classmethod
    def upper_symbol(cls, v):
        return v.upper().strip() if v else v

    def validate_price_alert(self) -> None:
        if self.alert_type == "PRICE_ALERT":
            if not self.symbol or self.threshold is None or not self.direction:
                raise ValueError(
                    "PRICE_ALERT requires symbol, threshold, and direction"
                )


class AlertRuleResponse(BaseModel):
    id: str
    alert_type: str
    symbol:    str | None
    threshold: str | None     # serialized as string for safe JSON
    direction: str | None
    is_active: bool
    triggered_count: int
    last_triggered_at: str | None
    created_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_obj(cls, obj) -> "AlertRuleResponse":
        return cls(
            id=str(obj.id),
            alert_type=obj.alert_type,
            symbol=obj.symbol,
            threshold=str(obj.threshold) if obj.threshold is not None else None,
            direction=obj.direction,
            is_active=obj.is_active,
            triggered_count=obj.triggered_count,
            last_triggered_at=obj.last_triggered_at.isoformat() if obj.last_triggered_at else None,
            created_at=obj.created_at.isoformat(),
        )


# ── Deliveries ─────────────────────────────────────────────────────────────

class AlertDeliveryResponse(BaseModel):
    id: str
    event_type: str
    message: str
    success: bool
    error: str | None
    sent_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_obj(cls, obj) -> "AlertDeliveryResponse":
        return cls(
            id=str(obj.id),
            event_type=obj.event_type,
            message=obj.message,
            success=obj.success,
            error=obj.error,
            sent_at=obj.sent_at.isoformat(),
        )
