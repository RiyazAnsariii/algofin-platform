# app/models/__init__.py
# Re-export all models so Alembic can discover them

from app.models.user import User, RefreshToken, LoginActivity
from app.models.exchange import (
    UserExchangeAccount,
    EncryptedApiCredential,
    ExchangeBillingConsent,
    ExchangeSyncRun,
)
from app.models.trading import Balance, Position, Trade
from app.models.events import EconomicEvent
from app.models.assistant import ChatThread, ChatMessage
from app.models.billing import UserProfitPeriod, BillingPeriodRecord
from app.models.order import Order          # v2 Phase B
from app.models.risk import RiskRule, RiskViolation  # v2 Phase D

__all__ = [
    "User",
    "RefreshToken",
    "LoginActivity",
    "UserExchangeAccount",
    "EncryptedApiCredential",
    "ExchangeBillingConsent",
    "ExchangeSyncRun",
    "Balance",
    "Position",
    "Trade",
    "EconomicEvent",
    "ChatThread",
    "ChatMessage",
    "UserProfitPeriod",
    "BillingPeriodRecord",
    "Order",          # v2 Phase B
    "RiskRule",       # v2 Phase D
    "RiskViolation",  # v2 Phase D
]
