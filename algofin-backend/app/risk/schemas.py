# app/risk/schemas.py
# AlgoFin v2 — Phase D: Risk rule Pydantic schemas

from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

# ── Literal types ─────────────────────────────────────────────────────────────
RuleType = Literal[
    "MAX_DAILY_LOSS",       # reject if today's realized PnL < -threshold USDT
    "MAX_POSITION_SIZE",    # reject if position size + order qty > threshold contracts
    "MAX_OPEN_POSITIONS",   # reject if open position count >= threshold
    "MAX_ORDER_SIZE",       # reject if single order qty > threshold contracts
]

RuleAction = Literal["reject", "alert"]


# ── Request schemas ───────────────────────────────────────────────────────────
class CreateRuleRequest(BaseModel):
    name:      str       = Field(..., min_length=1, max_length=100)
    rule_type: RuleType
    threshold: Decimal   = Field(..., gt=0, description="Positive limit value")
    action:    RuleAction = Field("reject")
    symbol:    Optional[str] = Field(
        None, max_length=30,
        description="Apply only to this symbol. Leave empty for global rule."
    )

    model_config = {"json_schema_extra": {
        "examples": [
            {
                "name": "Daily loss limit",
                "rule_type": "MAX_DAILY_LOSS",
                "threshold": "500.00",
                "action": "reject",
            },
            {
                "name": "BTC position cap",
                "rule_type": "MAX_POSITION_SIZE",
                "threshold": "0.5",
                "action": "reject",
                "symbol": "BTCUSDT",
            },
        ]
    }}


class UpdateRuleRequest(BaseModel):
    name:      Optional[str]     = Field(None, min_length=1, max_length=100)
    threshold: Optional[Decimal] = Field(None, gt=0)
    action:    Optional[RuleAction] = None
    is_active: Optional[bool]    = None
    symbol:    Optional[str]     = Field(None, max_length=30)


# ── Response schemas ──────────────────────────────────────────────────────────
class RuleOut(BaseModel):
    id:                UUID
    name:              str
    rule_type:         str
    threshold:         Decimal
    action:            str
    symbol:            Optional[str]
    is_active:         bool
    triggered_count:   int
    last_triggered_at: Optional[str]
    created_at:        str

    model_config = {"from_attributes": True}


class ViolationOut(BaseModel):
    id:            UUID
    rule_id:       UUID
    rule_type:     str
    threshold:     Decimal
    current_value: Decimal
    action_taken:  str
    symbol:        Optional[str]
    note:          Optional[str]
    occurred_at:   str

    model_config = {"from_attributes": True}
