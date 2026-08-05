#!/usr/bin/env python
# scripts/seed_admin.py
# One-shot: promote a user to admin by email.
# Usage (on Render shell or local with production env):
#
#   python scripts/seed_admin.py mdriyazansari2005@gmail.com
#   python scripts/seed_admin.py --email mdriyazansari2005@gmail.com
#
# Safe to run multiple times — idempotent.
# DO NOT add this to startCommand in render.yaml — run manually from shell.

import argparse
import asyncio
import os
import sys


async def promote(email: str) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy import text

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL env var not set")

    engine = create_async_engine(db_url, echo=False)
    async with AsyncSession(engine) as session:
        result = await session.execute(
            text("SELECT id, email, role FROM users WHERE email = :email"),
            {"email": email},
        )
        row = result.fetchone()
        if not row:
            print(f"[ERROR] No user found with email: {email}")
            await engine.dispose()
            sys.exit(1)

        user_id, user_email, current_role = row
        if current_role == "admin":
            print(f"[OK] {user_email} is already admin (id={user_id}) — no change.")
        else:
            await session.execute(
                text("UPDATE users SET role = 'admin' WHERE email = :email"),
                {"email": email},
            )
            await session.commit()
            print(f"[OK] Promoted {user_email} (id={user_id}) from '{current_role}' → 'admin'")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Promote a user to admin role")
    parser.add_argument(
        "email",
        nargs="?",
        help="Email address of the user to promote (positional)",
    )
    parser.add_argument(
        "--email",
        dest="email_flag",
        help="Email address of the user to promote (flag)",
    )
    args = parser.parse_args()

    target_email = args.email_flag or args.email
    if not target_email:
        print("Usage: python scripts/seed_admin.py <email>")
        print("   or: python scripts/seed_admin.py --email <email>")
        sys.exit(1)

    asyncio.run(promote(target_email))

