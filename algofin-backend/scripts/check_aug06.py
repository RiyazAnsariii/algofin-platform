# scripts/check_aug06.py
import asyncio
from datetime import date
from app.providers.tradingview_provider import TradingViewProvider


async def main():
    tv = TradingViewProvider()
    dtos, status = await tv.fetch_events(date(2026, 8, 6), date(2026, 8, 6))
    print(f"=== TradingView Provider Events for Aug 6, 2026 ({len(dtos)} events) ===")
    for dto in dtos:
        print(f"[{dto.currency}] ({dto.impact}) {dto.title} @ {dto.event_time_utc.strftime('%H:%M')}")


if __name__ == "__main__":
    asyncio.run(main())
