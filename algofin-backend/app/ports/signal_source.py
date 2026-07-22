# app/ports/signal_source.py
# AlgoFin v2 — Phase M: SignalSource port interface
#
# SignalSourcePort defines the contract that ALL external signal sources must satisfy.
# TradingView is one adapter (TradingViewSignalSource).
# Future adapters: ManualTriggerSource, PriceFeedSource, AISignalSource.
#
# Architecture: TradingView is a signal source, not a special case.
# The domain core (SignalService) never imports anything TradingView-specific.
# It only calls SignalSourcePort methods.

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Protocol, runtime_checkable


@dataclass(frozen=True)
class SignalPayload:
    """
    Normalized signal data extracted from a raw external payload.

    All signal sources (TradingView, manual, price feed) produce this common format.
    This is the data that crosses from SignalSourcePort into SignalService.

    Fields are typed precisely to enforce validation at the port boundary:
    - action: normalized to lowercase ("buy" | "sell")
    - ticker: uppercase (e.g. "BTCUSDT")
    - contracts: Decimal or None (signal overrides strategy quantity if provided)
    - price: Decimal or None (signal provides reference price, not necessarily limit price)
    - tv_timestamp: UTC datetime parsed from {{timenow}} or equivalent
    - is_test: True if signal was sent via test endpoint (?test=1)
    - raw_payload: original dict for forensic storage in StrategySignal.raw_payload
    """
    strategy_id: uuid.UUID
    action: str               # "buy" | "sell"
    ticker: str               # e.g. "BTCUSDT"
    contracts: Decimal | None
    price: Decimal | None
    tv_timestamp: datetime | None   # UTC. Used for replay attack detection.
    is_test: bool
    source_name: str          # "tradingview" | "manual" | "price_feed"
    sender_ip: str | None     # for IP allowlist audit
    raw_payload: dict         # stored as-is in StrategySignal.raw_payload


@runtime_checkable
class SignalSourcePort(Protocol):
    """
    Port for external signal sources.

    Each adapter implements:
    1. parse_payload — extracts and normalizes raw HTTP body into SignalPayload
    2. verify_authenticity — verifies the signal came from the declared source
    3. extract_timestamp — extracts the authoritative timestamp from the payload

    WebhookService calls these methods in order:
        raw_body → parse_payload → verify_authenticity → extract_timestamp → SignalService

    Architectural rule: WebhookService never reads raw_payload fields directly.
    It always uses the normalized SignalPayload returned by parse_payload.
    """

    # Source identifier — used in StrategySignal.source_name for audit trail
    source_name: str

    def parse_payload(self, raw: dict, strategy_id: uuid.UUID) -> SignalPayload:
        """
        Parses and normalizes a raw HTTP payload dict into a SignalPayload.

        Raises ValueError with a structured message if:
        - Required fields are missing
        - action is not "buy" or "sell" (case-insensitive)
        - contracts or price are not valid Decimals
        - payload exceeds validation rules

        Must NOT perform any I/O — pure in-memory parsing.
        Latency budget: < 5ms (Pydantic validation).
        """
        ...

    def verify_authenticity(
        self,
        raw: dict,
        secret_hash: str,
    ) -> bool:
        """
        Verifies that the signal payload is authentic.

        For TradingView: bcrypt.checkpw(raw["secret"].encode(), secret_hash.encode())
        For ManualTrigger: JWT bearer token validation
        For PriceFeedSource: HMAC-SHA256 signature on payload

        Returns True if authentic, False if not.
        Must NOT raise — returns False on any error (avoids information leakage).

        Latency budget: ≤ 80ms (bcrypt work factor 10 is intentionally slow).
        """
        ...

    def check_sender_ip(self, sender_ip: str) -> bool:
        """
        Checks if the sender IP is in the allowlist for this source.

        For TradingView: 4 known server IPs (ALLOWED_IPS constant in adapter).
        For ManualTrigger: always True (user's own browser).
        For PriceFeedSource: configured IP range.

        Returns True if allowed, False if not in allowlist.
        """
        ...
