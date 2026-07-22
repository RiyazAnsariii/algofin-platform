# app/adapters/tv_signal_source.py
# AlgoFin v2 — Phase M: TradingViewSignalSource
#
# Implements SignalSourcePort for TradingView webhooks.
#
# Architecture principle: TradingView is ONE implementation of SignalSourcePort.
# WebhookService never imports this file directly — it receives the adapter
# via dependency injection and calls only SignalSourcePort methods.
#
# Allowed IPs (Tier-2 constant — change requires deploy + ADR):
#   52.89.214.238, 34.212.75.30, 54.218.53.128, 52.32.178.7
# Source: https://www.tradingview.com/support/solutions/43000529348

import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import bcrypt

from app.config import settings
from app.ports.signal_source import SignalPayload, SignalSourcePort
from app.webhooks.schemas import TVWebhookPayload


class TradingViewSignalSource:
    """
    Adapter: TradingView → SignalSourcePort

    Implements:
    - parse_payload()        — TVWebhookPayload → SignalPayload
    - verify_authenticity()  — bcrypt.checkpw(payload["secret"], stored_hash)
    - check_sender_ip()      — checks against TV's 4 known server IPs
    """

    source_name: str = "tradingview"

    def parse_payload(
        self,
        raw: dict,
        strategy_id: uuid.UUID,
    ) -> SignalPayload:
        """
        Parses raw HTTP body dict → normalized SignalPayload.

        Raises ValueError (with structured message) on validation failure.
        Uses TVWebhookPayload for field-level validation.
        Must be pure (no I/O) — budget: < 5ms.
        """
        # Pydantic v2 validation — raises ValidationError on bad input
        try:
            validated = TVWebhookPayload(**raw)
        except Exception as exc:
            # Re-raise as plain ValueError so WebhookService can handle uniformly
            raise ValueError(f"Payload validation failed: {exc}") from exc

        return SignalPayload(
            strategy_id=strategy_id,
            action=validated.action,          # already normalized to lowercase
            ticker=validated.ticker,           # already normalized to uppercase
            contracts=validated.contracts,
            price=validated.price,
            tv_timestamp=validated.parsed_time,
            is_test=False,                     # test flag set by WebhookService via ?test=1 param
            source_name=self.source_name,
            sender_ip=None,                    # injected by WebhookService from request headers
            raw_payload=raw,
        )

    def verify_authenticity(
        self,
        raw: dict,
        secret_hash: str,
    ) -> bool:
        """
        Verifies that raw["secret"] matches the stored bcrypt hash.
        Returns False on any error — never raises (avoids info leakage).

        Latency: ~80ms (bcrypt work factor 10 — intentional, in budget).
        """
        try:
            plain = str(raw.get("secret", "")).encode("utf-8")
            hashed = secret_hash.encode("utf-8")
            return bcrypt.checkpw(plain, hashed)
        except Exception:
            return False

    def check_sender_ip(self, sender_ip: str) -> bool:
        """
        Checks if sender_ip is in TradingView's known server IP list.
        Returns True if IP is allowed, False otherwise.

        In development (environment != production): always returns True
        so you can test webhooks from localhost/ngrok without IP restriction.
        """
        if settings.environment != "production":
            return True  # Dev/staging: skip IP check
        return sender_ip in settings.tv_allowed_ips
