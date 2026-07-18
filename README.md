# AlgoFin

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-Upstash-DC382D?logo=redis&logoColor=white)](https://upstash.com)
[![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub_Actions-2088FF?logo=github-actions&logoColor=white)](https://github.com/RiyazAnsariii/algofin-platform/actions)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

An algorithmic trading portfolio management platform with live exchange integrations, an AI assistant, strategy engine, and risk controls.

---

## Features

- 📊 **Dashboard** — real-time PnL, balance, open positions
- 🔗 **Exchange Integrations** — Binance, Bybit, OKX via CCXT
- 🤖 **AI Assistant** — Gemini-powered chat with portfolio context
- ⚙️ **Strategy Engine** — rule-based trading conditions
- 🔔 **Alerts** — price, PnL, and risk-based notifications
- 📓 **Trading Journal** — annotate trades with mood and tags
- 🛡️ **Risk Controls** — drawdown limits and position size caps
- 📅 **Economic Calendar** — high-impact events with impact scoring
- 👤 **Admin Panel** — user management, sync monitoring
- 💳 **Billing** — plan tiers with feature gating

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python 3.12), SQLAlchemy, Alembic |
| Database | PostgreSQL (Neon free tier) |
| Cache / Queue | Redis (Upstash free tier) |
| AI | Google Gemini Flash (free tier) |
| Auth | JWT + httpOnly cookies, Google OAuth |
| Exchange | CCXT (Binance, Bybit, OKX) |
| CI/CD | GitHub Actions → Vercel + Render |

---

## Quick Start (Local)

### Windows
```bash
# Double-click or run:
dev.bat
```

### Manual
```bash
# Terminal 1 — Backend
cd algofin-backend
cp .env.example .env        # fill in SECRET_KEY and FERNET_KEY
python create_tables.py
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd algofin-platform
npm install
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## Testing

```bash
cd algofin-backend
python -m pytest -v
```

Tests cover: health endpoint, auth validation, JWT creation/verification,
bcrypt password hashing, settings validators, config loading.

---

## Deployment (Free Tier)

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full step-by-step guide.

**Services used (all free):**
- Frontend → [Vercel](https://vercel.com)
- Backend → [Render](https://render.com)
- Database → [Neon PostgreSQL](https://neon.tech)
- Redis → [Upstash](https://upstash.com)
- CI/CD → [GitHub Actions](https://github.com/features/actions)

---

## Project Structure

```
algofin/
├── algofin-backend/          # FastAPI backend
│   ├── app/
│   │   ├── auth/             # JWT auth, Google OAuth
│   │   ├── exchanges/        # Exchange account management
│   │   ├── portfolio/        # Balances, positions, PnL
│   │   ├── orders/           # Order placement and tracking
│   │   ├── alerts/           # Alert engine
│   │   ├── strategy/         # Rule-based strategy engine
│   │   ├── journal/          # Trading journal
│   │   ├── assistant/        # Gemini AI assistant
│   │   ├── billing/          # Plan tiers
│   │   ├── admin/            # Admin panel
│   │   └── common/           # Security, middleware, deps
│   ├── alembic/              # DB migrations
│   ├── tests/                # pytest test suite
│   └── render.yaml           # Render deployment config
│
└── algofin-platform/         # Next.js frontend
    ├── src/
    │   ├── app/              # App Router pages
    │   ├── components/       # UI components
    │   ├── lib/              # API client, utilities
    │   └── types/            # TypeScript types
    └── vercel.json           # Vercel deployment config
```

---

## License

MIT © 2026 [Riyaz Ansari](https://github.com/RiyazAnsariii)
