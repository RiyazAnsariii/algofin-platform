# tests/test_config.py
# AlgoFin — settings loading and config validator tests

import pytest
from pydantic import ValidationError


class TestSettingsLoading:
    def test_settings_load_without_error(self):
        """Settings must load successfully in development mode."""
        from app.config import settings
        assert settings is not None

    def test_environment_is_string(self):
        from app.config import settings
        assert isinstance(settings.environment, str)
        assert settings.environment in ("development", "staging", "production")

    def test_cors_origins_is_list(self):
        """cors_origins property must always return a list."""
        from app.config import settings
        origins = settings.cors_origins
        assert isinstance(origins, list)
        assert len(origins) >= 1

    def test_database_url_has_scheme(self):
        from app.config import settings
        assert "://" in settings.database_url

    def test_gemini_fallback_models_is_string(self):
        from app.config import settings
        assert isinstance(settings.gemini_fallback_models, str)

    def test_sync_intervals_are_positive(self):
        from app.config import settings
        assert settings.sync_balances_interval_minutes > 0
        assert settings.sync_positions_interval_minutes > 0
        assert settings.sync_trades_interval_minutes > 0
        assert settings.sync_events_interval_minutes > 0

    def test_jwt_expire_values_are_positive(self):
        from app.config import settings
        assert settings.jwt_access_expire_minutes > 0
        assert settings.jwt_refresh_expire_days > 0

    def test_secret_key_not_required_in_dev(self):
        """In development mode, empty SECRET_KEY must not raise."""
        from pydantic_settings import BaseSettings, SettingsConfigDict
        from pydantic import field_validator, ValidationInfo

        class MinimalSettings(BaseSettings):
            model_config = SettingsConfigDict(env_file=None)
            environment: str = "development"
            secret_key: str = ""

            @field_validator("secret_key")
            @classmethod
            def secret_key_required(cls, v: str, info: ValidationInfo) -> str:
                env = info.data.get("environment", "development")
                if env != "development" and (not v or len(v) < 32):
                    raise ValueError("SECRET_KEY required in production")
                return v

        s = MinimalSettings()
        assert s.secret_key == ""

    def test_secret_key_required_in_production(self):
        """In production mode, empty SECRET_KEY must raise ValidationError."""
        from pydantic_settings import BaseSettings, SettingsConfigDict
        from pydantic import field_validator, ValidationInfo

        class ProdSettings(BaseSettings):
            model_config = SettingsConfigDict(env_file=None)
            environment: str = "production"
            secret_key: str = ""

            @field_validator("secret_key")
            @classmethod
            def secret_key_required(cls, v: str, info: ValidationInfo) -> str:
                env = info.data.get("environment", "development")
                if env != "development" and (not v or len(v) < 32):
                    raise ValueError("SECRET_KEY required in production")
                return v

        with pytest.raises(ValidationError, match="SECRET_KEY"):
            ProdSettings()
