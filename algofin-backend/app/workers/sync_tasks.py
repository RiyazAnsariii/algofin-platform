# app/workers/sync_tasks.py
# AlgoFin v1 — Celery sync tasks

import asyncio
import logging

from sqlalchemy import select

from app.workers.celery_app import celery_app
from app.workers.sync_engine import (
    sync_balances,
    sync_full,
    sync_positions,
    sync_trades,
)

logger = logging.getLogger(__name__)


def _get_sync_db():
    """Get a synchronous DB session for Celery tasks (uses asyncio.run internally)."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings

    # Use sync URL for Celery tasks
    engine = create_engine(settings.database_url_sync)
    Session = sessionmaker(bind=engine)
    return Session()


async def _run_sync_for_account(
    account_id: str, sync_type: str, triggered_by: str = "scheduler"
):
    """Async implementation for syncing a single account."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.config import settings
    from app.models.exchange import UserExchangeAccount

    engine = create_async_engine(settings.database_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        result = await db.execute(
            select(UserExchangeAccount).where(
                UserExchangeAccount.id == account_id,
                UserExchangeAccount.is_active == True,  # noqa: E712
            )
        )
        account = result.scalar_one_or_none()
        if account is None:
            logger.warning(
                f"Account {account_id} not found or inactive — skipping sync"
            )
            return

        if sync_type == "balances":
            await sync_balances(db, account=account, triggered_by=triggered_by)
        elif sync_type == "positions":
            await sync_positions(db, account=account, triggered_by=triggered_by)
        elif sync_type == "trades":
            await sync_trades(db, account=account, triggered_by=triggered_by)
        elif sync_type == "full":
            await sync_full(db, account=account, triggered_by=triggered_by)

    await engine.dispose()


@celery_app.task(name="app.workers.sync_tasks.sync_account", bind=True, max_retries=3)
def sync_account(
    self, account_id: str, sync_type: str = "full", triggered_by: str = "scheduler"
):
    """Sync a single exchange account."""
    try:
        asyncio.run(_run_sync_for_account(account_id, sync_type, triggered_by))
    except Exception as exc:
        logger.exception(f"Sync task failed for account {account_id}: {exc}")
        raise self.retry(exc=exc, countdown=60)


async def _sync_all_accounts(sync_type: str):
    """Sync all active accounts."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.config import settings
    from app.models.exchange import UserExchangeAccount

    engine = create_async_engine(settings.database_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        result = await db.execute(
            select(UserExchangeAccount).where(UserExchangeAccount.is_active == True)  # noqa: E712
        )
        accounts = result.scalars().all()

    await engine.dispose()

    # Queue individual sync tasks
    for account in accounts:
        sync_account.apply_async(
            args=[str(account.id), sync_type, "scheduler"],
            queue="sync",
        )
    logger.info(f"Queued {len(accounts)} {sync_type} sync tasks")


@celery_app.task(name="app.workers.sync_tasks.sync_all_accounts")
def sync_all_accounts(sync_type: str = "full"):
    """Scheduled task: queue sync for all active accounts."""
    asyncio.run(_sync_all_accounts(sync_type))


# Alias used by admin panel trigger
sync_full_account = sync_account
