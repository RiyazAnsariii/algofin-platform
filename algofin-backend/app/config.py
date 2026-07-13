# app/config.py
# AlgoFin v1 — Application configuration (pydantic-settings)

from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    # Used to sign JWTs
    secret_key: str = "dev_secret_key_change_in_production"

    # Fernet key for encrypting exchange API credentials at rest
    # Generate: from cryptography.fernet import Fernet; Fernet.generate_key()
    fernet_key: str = ""

    # ── JWT ────────────────────────────────────────────────────────
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 30
    jwt_refresh_expire_days: int = 30

    # ── CORS ───────────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:3000"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    # ── Celery ─────────────────────────────────────────────────────
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # ── Gemini AI ───────────────────────────────────────────────
    # Get your free API key at: https://aistudio.google.com/app/apikey
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"  # free tier model
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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
