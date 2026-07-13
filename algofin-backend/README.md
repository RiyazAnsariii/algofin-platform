# AlgoFin Backend

FastAPI backend for AlgoFin v1 — Binance USDT-M Futures trading dashboard.

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Python 3.12+ (for local dev without Docker)

### 1. Set up environment

```bash
cp .env.example .env
# Edit .env — fill in FERNET_KEY and SECRET_KEY
# Generate FERNET_KEY: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Generate SECRET_KEY: python -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Start services

```bash
docker-compose up -d postgres redis
```

### 3. Run migrations

```bash
# From algofin-backend/
pip install -r requirements.txt
alembic upgrade head
```

### 4. Start API

```bash
docker-compose up api
# or locally:
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Start Celery workers

```bash
docker-compose up worker beat
```

## API Docs

Available at http://localhost:8000/docs (development only)

## Architecture

```
app/
  auth/          — signup, login, refresh tokens, logout
  exchanges/     — connect, list, revoke exchange accounts
  portfolio/     — portfolio summary, positions, trades
    pnl.py       — THE single calculate_period_pnl() function
  billing/       — billing period estimates
  events/        — economic calendar
  assistant/     — AI assistant (Phase E)
  models/        — SQLAlchemy models (all v1 core tables)
  common/        — security, deps, schemas, staleness
  workers/       — Celery tasks + sync engine
  config.py      — pydantic-settings config
  database.py    — async SQLAlchemy engine
  main.py        — FastAPI app

alembic/         — database migrations
```

## Key Decisions (locked per plan.md)

- Binance USDT-M Futures ONLY (exchange_id = "binance_usdtm")
- Access token → Authorization: Bearer header (frontend manages)
- Refresh token → httpOnly cookie (backend manages)
- exchange_sync_runs required before first sync
- calculate_period_pnl() is the ONLY place PnL is calculated
- realized_pnl from Binance API "realizedPnl" field — never re-derived
- No high-water mark anywhere in schema
- billing_period_records (NOT performance_fee_records)
