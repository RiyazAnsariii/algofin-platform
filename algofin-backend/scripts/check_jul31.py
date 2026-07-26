# scripts/check_jul31.py
import asyncio
from datetime import date
from app.database import AsyncSessionLocal
from app.repositories.economic_calendar_repository import EconomicCalendarRepository
from app.providers.tradingview_provider import TradingViewProvider


async def main():
    tv = TradingViewProvider()
    dtos, status = await tv.fetch_events(date(2026, 7, 31), date(2026, 7, 31))
    print(f"=== TradingView Provider Events for Jul 31, 2026 ({len(dtos)} events) ===")
    for dto in dtos:
        print(f"[{dto.currency}] ({dto.impact}) {dto.title} @ {dto.event_time_utc.strftime('%H:%M')}")


if __name__ == "__main__":
    asyncio.run(main())
