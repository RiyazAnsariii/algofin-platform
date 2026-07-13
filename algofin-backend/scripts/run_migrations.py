#!/usr/bin/env python3
"""
AlgoFin v1 — Database Migration Bootstrap
==========================================
Runs Alembic migrations to create all tables.
Run this ONCE after docker-compose up postgres.

Usage:
    python scripts/run_migrations.py

Or directly:
    alembic upgrade head
"""

import os
import subprocess
import sys


def main() -> None:
    # Change to backend root
    backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(backend_root)

    print("AlgoFin — Running database migrations")
    print(f"Working dir: {backend_root}")
    print()

    # Check alembic is available
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "current"],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            print("Alembic not configured or DB not reachable:")
            print(result.stderr)
            sys.exit(1)
        print(f"Current revision: {result.stdout.strip() or '(none)'}")
    except FileNotFoundError:
        print("ERROR: alembic not found. Run: pip install alembic")
        sys.exit(1)

    # First migration: generate if no versions exist
    versions_dir = os.path.join(backend_root, "alembic", "versions")
    version_files = [f for f in os.listdir(versions_dir) if f.endswith(".py")]

    if not version_files:
        print("\nNo migration files found — generating initial migration...")
        gen_result = subprocess.run(
            [sys.executable, "-m", "alembic", "revision",
             "--autogenerate", "-m", "initial_schema"],
            capture_output=True, text=True, timeout=60
        )
        if gen_result.returncode != 0:
            print(f"ERROR generating migration:\n{gen_result.stderr}")
            sys.exit(1)
        print(f"Generated: {gen_result.stdout.strip()}")

    # Apply migrations
    print("\nApplying migrations...")
    up_result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        capture_output=True, text=True, timeout=120
    )

    print(up_result.stdout)
    if up_result.returncode != 0:
        print(f"ERROR:\n{up_result.stderr}")
        sys.exit(1)

    print("\n✅ Migrations complete. All tables created.")
    print("\nTables created:")
    print("  users, refresh_tokens, login_activity")
    print("  user_exchange_accounts, encrypted_api_credentials")
    print("  exchange_billing_consents, exchange_sync_runs  ← required before first sync")
    print("  balances, positions, trades")
    print("  economic_events")
    print("  chat_threads, chat_messages")
    print("  user_profit_periods, billing_period_records")


if __name__ == "__main__":
    main()
