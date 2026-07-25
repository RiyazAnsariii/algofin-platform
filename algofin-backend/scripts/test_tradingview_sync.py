# scripts/test_tradingview_sync.py
"""
Test script to verify TradingView economic calendar provider syncs
real live data into the database and serves it correctly.
"""
import asyncio
from datetime import date, timedelta

from app.database import AsyncSessionLocal
from app.providers.tradingview_provider import TradingViewProvider
from app.services.economic_calendar_service import EconomicCalendarService


async def main():
    provider = TradingViewProvider()
    today = date.today()
    to_date = today + timedelta(days=7)

    print(f"=== Testing TradingView Provider directly ===")
    print(f"Fetching events from {today} to {to_date} ...")
    dtos, status = await provider.fetch_events(today, to_date)
    print(f"HTTP Status: {status}")
    print(f"Events Fetched: {len(dtos)}")

    if dtos:
        print("\nSample events:")
        for e in dtos[:5]:
            print(
                f"  [{e.impact:6s}] {e.currency} | {e.event_time_utc.strftime('%Y-%m-%d %H:%M UTC')} "
                f"| {e.title[:50]:<50} | A={e.actual} F={e.forecast} P={e.previous}"
            )

    print(f"\n=== Testing full sync via EconomicCalendarService ===")
    async with AsyncSessionLocal() as db:
        service = EconomicCalendarService(db)
        metrics = await service.sync_events(today, to_date, redis=None)
        print("Provider:", metrics.get("provider"))
        print("Events Count:", metrics.get("total_events_count"))
        print("Last Sync:", metrics.get("last_successful_sync"))
        print("Duration:", metrics.get("last_sync_duration_ms"), "ms")
        print("Error:", metrics.get("last_error"))

        print(f"\n=== Testing GET /api/v1/economic-calendar ===")
        res = await service.get_calendar_response(days=7, redis=None)
        print("Summary:", res["summary"])
        print("Total Events Returned:", len(res["events"]))

        if res["events"]:
            print("\nFirst 5 events via API:")
            for e in res["events"][:5]:
                print(
                    f"  [{e['impact']:6s}] {e['currency']} | {e['event_time']} "
                    f"| {e['title'][:45]:<45} | Status={e['status']}"
                )


if __name__ == "__main__":
    asyncio.run(main())
