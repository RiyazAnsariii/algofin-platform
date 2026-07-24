# scripts/test_api_endpoint.py
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app


async def main():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        print("=== Testing GET /api/v1/economic-calendar ===")
        res = await client.get("/api/v1/economic-calendar")
        print("Status Code:", res.status_code)
        data = res.json()
        print("Events Count:", len(data["events"]))
        print("Summary Counts:", data["summary"])
        print("Metadata:", data["metadata"])
        if data["events"]:
            print("\nFirst Event Sample:")
            print("Title:", data["events"][0]["title"])
            print("Country:", data["events"][0]["country"])
            print("Currency:", data["events"][0]["currency"])
            print("Impact:", data["events"][0]["impact"])
            print("Status:", data["events"][0]["status"])
            print("Event Time:", data["events"][0]["event_time"])


if __name__ == "__main__":
    asyncio.run(main())
