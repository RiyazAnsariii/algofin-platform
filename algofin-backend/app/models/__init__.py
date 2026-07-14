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
from app.models.alert import TelegramConfig, AlertRule, AlertDelivery  # v2 Phase E
from app.models.strategy import Strategy, StrategyExecution  # v2 Phase F
from app.models.journal import JournalEntry  # v2 Phase G

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
    "Order",           # v2 Phase B
    "RiskRule",        # v2 Phase D
    "RiskViolation",   # v2 Phase D
    "TelegramConfig",  # v2 Phase E
    "AlertRule",       # v2 Phase E
    "AlertDelivery",   # v2 Phase E
    "Strategy",          # v2 Phase F
    "StrategyExecution", # v2 Phase F
    "JournalEntry",      # v2 Phase G
]
