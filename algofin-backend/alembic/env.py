# alembic/env.py
# Alembic environment for AlgoFin migrations (async engine)

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.database import Base, _build_pg_engine_args

# Import all models so Alembic can detect schema
import app.models  # noqa: F401 — this triggers __init__.py which imports all models

config = context.config

# Strip ?sslmode=require from URL before passing to asyncpg.
# asyncpg does not accept sslmode as a query param (libpq-only).
# _build_pg_engine_args returns (clean_url, connect_args) with ssl='require'
# in connect_args when the original URL contained sslmode=require.
_db_url, _connect_args = _build_pg_engine_args(settings.database_url)
config.set_main_option("sqlalchemy.url", _db_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Build the engine directly so we can pass connect_args for SSL.
    # async_engine_from_config does not support connect_args cleanly.
    connectable = create_async_engine(
        _db_url,
        connect_args=_connect_args,
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
