# scripts/purge_blacklisted_events.py
import asyncio
import logging
from app.database import AsyncSessionLocal
from app.repositories.economic_calendar_repository import EconomicCalendarRepository

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    logger.info("Starting purge of blacklisted economic events from database...")
    async with AsyncSessionLocal() as session:
        repo = EconomicCalendarRepository(session)
        deleted_count = await repo.purge_blacklisted_events()
        logger.info(f"Successfully purged {deleted_count} blacklisted economic events.")


if __name__ == "__main__":
    asyncio.run(main())
