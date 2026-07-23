# app/config.py
# AlgoFin v1 — Application configuration (pydantic-settings)

from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, ValidationInfo


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Application ────────────────────────────────────────────────
    app_name: str = "AlgoFin API"
    environment: str = "development"
    debug: bool = False

    # ── Database ───────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://algofin:algofin@localhost:5432/algofin"

    # Sync DB URL for Alembic (uses psycopg2)
    @property
    def database_url_sync(self) -> str:
        return self.database_url.replace("postgresql+asyncpg://", "postgresql://")

    # ── Redis ──────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Security ───────────────────────────────────────────────────
    secret_key: str = ""

    @field_validator("secret_key")
    @classmethod
    def secret_key_required(cls, v: str, info: ValidationInfo) -> str:
        env = info.data.get("environment", "development")
        if env != "development" and (not v or len(v) < 32):
            raise ValueError(
                "SECRET_KEY must be set and at least 32 characters long. "
                'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return v

    fernet_key: str = ""

    @field_validator("fernet_key")
    @classmethod
    def fernet_key_required(cls, v: str, info: ValidationInfo) -> str:
        env = info.data.get("environment", "development")
        if env != "development" and not v:
            raise ValueError(
                "FERNET_KEY must be set in production. "
                'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
            )
        return v

    # ── JWT ────────────────────────────────────────────────────────
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 30
    jwt_refresh_expire_days: int = 30

    # ── CORS ───────────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000"
    frontend_url: str = (
        "https://algofin-platform.vercel.app"  # overridden by FRONTEND_URL env var
    )

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    # ── Celery ─────────────────────────────────────────────────────
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # ── Gemini AI ───────────────────────────────────────────────
    # Get your free API key at: https://aistudio.google.com/app/apikey
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"  # primary model
    # Fallback models tried in order if primary hits quota (429)
    gemini_fallback_models: str = "gemini-flash-lite-latest,gemini-2.0-flash-lite-001"
    assistant_max_history: int = 40  # messages kept in context per session

    # ── Sync intervals (minutes) ───────────────────────────────────
    sync_balances_interval_minutes: int = 10
    sync_positions_interval_minutes: int = 5
    sync_trades_interval_minutes: int = 20
    sync_events_interval_minutes: int = 30

    # ── Staleness thresholds (minutes) ────────────────────────────
    # Must match plan.md Section 8
    stale_balances_minutes: int = 15
    stale_positions_minutes: int = 10
    stale_trades_minutes: int = 30
    stale_events_minutes: int = 60

    # ── Google OAuth ───────────────────────────────────────────────
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = (
        "https://algofin-api.onrender.com/api/v1/auth/google/callback"
    )

    # ── SMTP Email Delivery (Gmail / Custom SMTP) ─────────────────
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""  # e.g. mdriyazansari2005@gmail.com
    smtp_password: str = ""  # Gmail App Password
    smtp_from_email: str = ""  # e.g. AlgoFin Security <mdriyazansari2005@gmail.com>

    # ── Phase M: Webhook Engine (Tier-2 operational constants) ────────
    # These require a code change + deploy to modify.
    # Admin-configurable values (Tier-3) live in the system_settings DB table.

    # Queue keys (Redis)
    webhook_queue_key: str = "algofin:webhook_queue"
    webhook_retry_key: str = "algofin:webhook_retry"
    webhook_dlq_key: str = "algofin:webhook_dlq"
    webhook_dedup_prefix: str = "algofin:dedup:"
    webhook_ratelimit_prefix: str = "algofin:ratelimit:strategy:"
    webhook_brute_prefix: str = "algofin:brute:"
    worker_heartbeat_key: str = "algofin:worker:heartbeat"

    # Retry policy (exponential backoff delays in seconds)
    webhook_retry_delays: list[int] = [1, 5, 30]
    webhook_max_retries: int = 3

    # Timing
    webhook_replay_window_seconds: int = 60  # reject signals older than 60s
    webhook_payload_max_bytes: int = 10_240  # 10 KB hard limit before JSON parse
    webhook_dedup_ttl_seconds: int = 300  # Redis dedup key lifetime (5 min)
    webhook_secret_grace_seconds: int = 300  # old secret valid 5 min after rotation
    webhook_processing_timeout_minutes: int = (
        5  # signal stuck in PROCESSING → reconcile
    )

    # Rate limiting
    webhook_rate_limit: int = 100  # max signals per minute per strategy
    webhook_brute_force_limit: int = 5  # bad secrets per IP before block (60s)

    # TradingView allowed IPs (Tier-2: changing requires deploy + ADR)
    tradingview_allowed_ips: str = (
        "52.89.214.238,34.212.75.30,54.218.53.128,52.32.178.7"
    )

    @property
    def tv_allowed_ips(self) -> set[str]:
        return {ip.strip() for ip in self.tradingview_allowed_ips.split(",")}

    # Max active pine_webhook strategies per user (system-wide invariant)
    max_active_strategies_per_user: int = 50


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
