#!/usr/bin/env python3
# scripts/create_admin.py
# AlgoFin v1 — Create or promote a user to admin role
#
# Usage (run inside the backend Docker container or venv):
#   python scripts/create_admin.py --email admin@yoursite.com
#
# Or if user already exists, promotes them:
#   python scripts/create_admin.py --email existing@user.com --promote

import argparse
import asyncio
import getpass
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def run(email: str, promote: bool) -> None:
    from sqlalchemy import select
    from app.database import AsyncSessionLocal
    from app.models.user import User
    from app.common.security import hash_password

    async with AsyncSessionLocal() as db:
        # Check if user exists
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user and promote:
            user.role = "admin"
            await db.commit()
            print(f"\n  ✓ User '{email}' promoted to admin role.\n")
            return

        if user:
            print(f"\n  ⚠ User '{email}' already exists.")
            print("  Use --promote to make them an admin.\n")
            return

        # Create new admin user
        print(f"\n  Creating admin user: {email}")
        password = getpass.getpass("  Password: ")
        confirm  = getpass.getpass("  Confirm:  ")

        if password != confirm:
            print("  ✗ Passwords do not match.\n")
            sys.exit(1)

        if len(password) < 8:
            print("  ✗ Password must be at least 8 characters.\n")
            sys.exit(1)

        full_name = input("  Full name: ").strip() or "Admin"

        admin = User(
            email=email,
            hashed_password=hash_password(password),
            full_name=full_name,
            role="admin",
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        print(f"\n  ✓ Admin user created: {email}\n")
        print("  You can now log in at /login and access /admin.\n")


def main():
    parser = argparse.ArgumentParser(description="AlgoFin admin user management")
    parser.add_argument("--email",   required=True, help="User email address")
    parser.add_argument("--promote", action="store_true", help="Promote existing user to admin")
    args = parser.parse_args()

    asyncio.run(run(args.email, args.promote))


if __name__ == "__main__":
    main()
