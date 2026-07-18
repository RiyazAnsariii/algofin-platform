# app/config.py
# AlgoFin v1 — Application configuration (pydantic-settings)

from functools import lru_cache
from typing import Any, List
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
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
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
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        return v

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
    gemini_model: str = "gemini-flash-latest"   # primary model
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
    google_redirect_uri: str = "http://localhost:3000/api/v1/auth/google/callback"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
