import asyncio
from app.database import AsyncSessionLocal, engine, Base
from app.models import *  # noqa — registers all models
from app.models.user import User
from app.common.security import hash_password
from sqlalchemy import select
import uuid

EMAIL    = "dev@algofin.local"
PASSWORD = "algofin123"
NAME     = "Dev User"

async def seed():
    # Ensure all tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # Check if user already exists
        result = await db.execute(select(User).where(User.email == EMAIL))
        existing = result.scalar_one_or_none()
        if existing:
            print(f"User already exists: {existing.email}")
            return

        user = User(
            id=uuid.uuid4(),
            email=EMAIL,
            full_name=NAME,
            hashed_password=hash_password(PASSWORD),
            role="user",
            is_active=True,
        )
        db.add(user)
        await db.commit()
        print(f"Dev user created:")
        print(f"  Email:    {EMAIL}")
        print(f"  Password: {PASSWORD}")

asyncio.run(seed())
