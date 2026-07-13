# app/exchanges/schemas.py
# AlgoFin v1 — Exchange connect/list/revoke Pydantic schemas
# POST /exchanges/connect request/response per plan.md Section 9

from pydantic import BaseModel, field_validator


# ── Billing consent payload (per plan.md Section 9 spec) ─────────
REQUIRED_CONSENT_TEXT = (
    "AlgoFin calculates and displays an estimated performance fee of 20% of my "
    "monthly realized profit from this Binance Futures account for beta evaluation "
    "purposes. This is not a charge. All manual trades on this account are included "
    "regardless of whether AlgoFin placed them."
)


class BillingConsentPayload(BaseModel):
    consented: bool
    consent_version: str = "v1.0"
    consent_text: str

    @field_validator("consented")
    @classmethod
    def must_be_consented(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Billing consent is required to connect an exchange account")
        return v


class ConnectExchangeRequest(BaseModel):
    """
    POST /exchanges/connect body.
    plan.md Section 9 — exact request spec.
    billing_consent is REQUIRED. If missing or consented=false, request is rejected.
    """
    exchange_id: str        # must be "binance_usdtm" in v1
    label: str
    api_key: str
    api_secret: str
    passphrase: str | None = None
    billing_consent: BillingConsentPayload

    @field_validator("exchange_id")
    @classmethod
    def validate_exchange_id(cls, v: str) -> str:
        if v != "binance_usdtm":
            raise ValueError("Only 'binance_usdtm' is supported in v1")
        return v

    @field_validator("label")
    @classmethod
    def label_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Account label is required")
        return v

    @field_validator("api_key")
    @classmethod
    def api_key_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("API key is required")
        return v

    @field_validator("api_secret")
    @classmethod
    def api_secret_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("API secret is required")
        return v


class ExchangeAccountResponse(BaseModel):
    """Response schema for an exchange account (never exposes raw API keys)."""
    id: str
    label: str
    exchange_id: str
    sync_status: str
    billing_consent: bool
    last_sync_at: str | None
    billing_consent_at: str | None
    created_at: str

    model_config = {"from_attributes": True}


class TriggerSyncRequest(BaseModel):
    sync_type: str = "full"  # balances | positions | trades | full

    @field_validator("sync_type")
    @classmethod
    def valid_sync_type(cls, v: str) -> str:
        valid = {"balances", "positions", "trades", "full"}
        if v not in valid:
            raise ValueError(f"sync_type must be one of: {', '.join(valid)}")
        return v
