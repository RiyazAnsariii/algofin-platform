# scripts/fix_high_impact_events.py
import asyncio
import logging
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.economic_event import EconomicEvent
from app.events.blacklist import is_forced_high_impact

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    logger.info("Starting update of forced high impact economic events in database...")
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(EconomicEvent))
        events = result.scalars().all()
        updated_count = 0
        for evt in events:
            if is_forced_high_impact(evt.title) and evt.impact != "High":
                evt.impact = "High"
                updated_count += 1
        if updated_count > 0:
            await session.commit()
            logger.info(f"Successfully updated {updated_count} events to High Impact in database.")
        else:
            logger.info("All high impact events are already set to High in database.")


if __name__ == "__main__":
    asyncio.run(main())
