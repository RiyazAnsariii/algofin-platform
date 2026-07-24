# scripts/test_fmp_sync.py
import asyncio
from datetime import date, timedelta
from app.database import AsyncSessionLocal
from app.services.economic_calendar_service import EconomicCalendarService


async def main():
    async with AsyncSessionLocal() as db:
        service = EconomicCalendarService(db)

        today = date.today()
        to_date = today + timedelta(days=7)

        print(f"=== Triggering Economic Calendar Sync for {today} to {to_date} ===")
        metrics = await service.sync_events(today, to_date, redis=None)
        print("Sync Metrics:", metrics)

        print("\n=== Testing GET /api/v1/economic-calendar Response Generation ===")
        res = await service.get_calendar_response(days=7, redis=None)
        print("Summary Counts:", res["summary"])
        print("Metadata:", res["metadata"])
        print(f"Total Events Formatted: {len(res['events'])}")

        if res["events"]:
            print("\nSample Event 1:")
            print(res["events"][0])

if __name__ == "__main__":
    asyncio.run(main())
