# app/database.py
# AlgoFin v1/v2 — Async SQLAlchemy + async Redis setup
# Supports both PostgreSQL (production) and SQLite (local dev/demo)

from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool
from sqlalchemy.dialects.postgresql import UUID as PostgresUUID
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator
import uuid as uuid_module

from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")


def _build_pg_engine_args(raw_url: str) -> tuple[str, dict]:
    """
    asyncpg only accepts its own connection keywords — it rejects libpq-specific
    query parameters such as sslmode, channel_binding, gssencmode, etc.

    This function:
      1. Strips all libpq-only parameters from the URL
      2. Returns ssl='require' in connect_args when sslmode was require/verify-*
      3. Leaves other parameters (e.g. application_name) intact
      4. Is a no-op for SQLite URLs (not called for those)

    Tested against Neon, Supabase, and standard PostgreSQL connection strings.
    """
    # libpq parameters that asyncpg does not accept as keyword arguments.
    # Keep this list updated if new providers add unusual params.
    LIBPQ_ONLY_PARAMS = {
        "sslmode",
        "channel_binding",
        "gssencmode",
        "sslcert",
        "sslkey",
        "sslrootcert",
        "sslcrl",
        "sslpassword",
        "krbsrvname",
        "gsslib",
        "target_session_attrs",
    }

    parsed = urlparse(raw_url)
    params = parse_qs(parsed.query, keep_blank_values=True)

    # Extract sslmode before stripping (to decide whether to add ssl=require)
    sslmode = params.pop("sslmode", [None])[0]

    # Strip all other libpq-only params
    for key in LIBPQ_ONLY_PARAMS - {"sslmode"}:
        params.pop(key, None)

    # Rebuild clean URL
    clean_query = urlencode({k: v[0] for k, v in params.items()})
    clean_url = urlunparse(parsed._replace(query=clean_query))

    connect_args: dict = {}
    if sslmode and sslmode not in ("disable", "allow", "prefer"):
        # sslmode=require / verify-ca / verify-full → enforce TLS
        connect_args["ssl"] = "require"

    return clean_url, connect_args



# ── UUIDType — works on both PostgreSQL and SQLite ────────────────
class UUIDType(TypeDecorator):
    """
    UUID stored as native UUID on PostgreSQL, VARCHAR(36) on SQLite.
    All models use this type for primary keys and foreign keys.
    """
    impl = String(36)
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(PostgresUUID(as_uuid=True))
        return dialect.type_descriptor(String(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value  # pass UUID object
        return str(value)  # SQLite: string

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, uuid_module.UUID):
            return value
        return uuid_module.UUID(str(value))


# ── Engine ────────────────────────────────────────────────────────
if _is_sqlite:
    # SQLite: use StaticPool (single connection, no pool args)
    engine = create_async_engine(
        settings.database_url,
        echo=settings.debug,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
else:
    # PostgreSQL: strip sslmode from URL, pass SSL via connect_args
    # (asyncpg rejects ?sslmode=require — it's a libpq-only param)
    _pg_url, _pg_connect_args = _build_pg_engine_args(settings.database_url)
    engine = create_async_engine(
        _pg_url,
        echo=settings.debug,
        connect_args=_pg_connect_args,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

# ── Session factory ───────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Base class for all models ─────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── Dependency for FastAPI routes ─────────────────────────────────
async def get_db() -> AsyncSession:  # type: ignore[misc]
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Async Redis client (singleton) ────────────────────────────────
# Used by: Market Data WebSocket (pub/sub) and future event streams
import redis.asyncio as aioredis  # type: ignore[import]

_redis_client: aioredis.Redis | None = None


async def get_redis_client() -> aioredis.Redis:
    """Return the singleton async Redis client, creating it on first call."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def close_redis_client() -> None:
    """Close the Redis client. Called on app shutdown."""
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None
