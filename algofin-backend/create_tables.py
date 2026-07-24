import asyncio
from app.database import engine, Base
from app.models import *  # noqa

async def create():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created OK")

if __name__ == "__main__":
    asyncio.run(create())
