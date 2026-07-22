# app/webhooks/schemas.py
# AlgoFin v2 — Phase M: TradingView webhook payload schema
#
# Architecture rule: WebhookService NEVER reads raw HTTP body fields directly.
# ALL external data must pass through this Pydantic schema first.
#
# TradingView alert message format (configure in TradingView alert dialog):
# {
#   "secret":    "{{strategy.order.alert_message}}",  ← per-strategy bcrypt secret
#   "action":    "{{strategy.order.action}}",          ← "buy" or "sell"
#   "ticker":    "{{ticker}}",                         ← e.g. "BTCUSDT"
#   "contracts": {{strategy.order.contracts}},         ← quantity (number, no quotes)
#   "price":     {{close}},                            ← reference price
#   "time":      "{{timenow}}"                         ← ISO8601 timestamp
# }

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class TVWebhookPayload(BaseModel):
    """
    Strict validation schema for TradingView webhook payloads.

    Designed to reject malformed payloads before any DB or Redis access.
    All validation happens in < 5ms (Pydantic v2 core speed).

    Field contract (matches TradingView alert message template):
    - secret:    required — per-strategy bcrypt secret (verified by SecretService)
    - action:    required — "buy" or "sell" (normalized to lowercase)
    - ticker:    required — symbol e.g. "BTCUSDT" (normalized to uppercase)
    - contracts: optional — position size (uses strategy default if absent)
    - price:     optional — reference price at signal time
    - time:      optional — {{timenow}} for replay detection
    """

    secret: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Per-strategy webhook secret (verified via bcrypt, never stored)",
    )
    action: str = Field(
        ...,
        description='Signal direction: "buy" or "sell"',
    )
    ticker: str = Field(
        ...,
        min_length=1,
        max_length=30,
        description='Trading pair symbol e.g. "BTCUSDT"',
    )
    contracts: Decimal | None = Field(
        default=None,
        gt=0,
        description="Position size (positive). Uses strategy default if absent.",
    )
    price: Decimal | None = Field(
        default=None,
        gt=0,
        description="Reference price at signal time.",
    )
    time: str | None = Field(
        default=None,
        description="ISO8601 timestamp from {{timenow}} — used for replay detection.",
    )

    # ── Validators ────────────────────────────────────────────────────────────

    @field_validator("action", mode="before")
    @classmethod
    def normalize_action(cls, v: Any) -> str:
        if not isinstance(v, str):
            raise ValueError("action must be a string")
        normalized = str(v).lower().strip()
        if normalized not in ("buy", "sell"):
            raise ValueError(f"action must be 'buy' or 'sell', got: {v!r}")
        return normalized

    @field_validator("ticker", mode="before")
    @classmethod
    def normalize_ticker(cls, v: Any) -> str:
        if not isinstance(v, str):
            raise ValueError("ticker must be a string")
        return str(v).upper().strip()

    @field_validator("secret", mode="before")
    @classmethod
    def strip_secret(cls, v: Any) -> str:
        """Trim whitespace only — do not log or expose the secret value."""
        if not isinstance(v, str):
            raise ValueError("secret must be a string")
        return str(v).strip()

    @property
    def parsed_time(self) -> datetime | None:
        """Parses the 'time' field to UTC datetime. Returns None if absent or unparseable."""
        if not self.time:
            return None
        try:
            # TradingView sends ISO8601: "2024-01-15T10:30:00Z" or with offset
            dt = datetime.fromisoformat(self.time.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except (ValueError, AttributeError):
            return None


# ── Response schema ───────────────────────────────────────────────────────────
# Architecture rule: webhook always returns HTTP 200 with {"status": "..."}
# NEVER return 4xx/5xx to TradingView (it retries on non-200).

class WebhookResponse(BaseModel):
    """
    Standard webhook response.
    status values visible to TradingView:
      "accepted"      — signal received and queued for processing
      "test_accepted" — test signal received (logged, not executed)
      "invalid"       — payload validation failed (generic — no detail exposed)
      "duplicate"     — idempotency key already seen
    """
    status: str
    signal_id: str | None = None  # UUID of created signal (for debugging)
