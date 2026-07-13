# app/workers/billing_tasks.py
# AlgoFin v1 — Celery billing tasks

import asyncio
import logging

from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _refresh_all_billing():
    """Refresh billing periods for all users with active consented accounts."""
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from sqlalchemy import select
    from app.config import settings
    from app.models.user import User
    from app.billing.service import get_or_create_current_period

    engine = create_async_engine(settings.database_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as db:
        result = await db.execute(select(User).where(User.is_active == True))  # noqa: E712
        users = result.scalars().all()
        for user in users:
            try:
                await get_or_create_current_period(db, user_id=str(user.id))
            except Exception as exc:
                logger.error(f"Billing refresh failed for user {user.id}: {exc}")

    await engine.dispose()
    logger.info(f"Billing periods refreshed for {len(users)} users")


@celery_app.task(name="app.workers.billing_tasks.refresh_all_billing_periods")
def refresh_all_billing_periods():
    """Daily task: refresh billing period estimates for all users."""
    asyncio.run(_refresh_all_billing())
