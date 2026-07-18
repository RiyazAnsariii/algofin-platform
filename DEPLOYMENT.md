# AlgoFin — Free-Tier Deployment Guide

## Architecture Overview

```
GitHub (main branch)
    │
    ├── Push → GitHub Actions CI
    │       ├── lint/type-check (backend + frontend)
    │       ├── Deploy frontend → Vercel (automatic)
    │       └── Trigger redeploy → Render (via deploy hook)
    │
    ├── Frontend → Vercel (free hobby plan)
    │       URL: https://algofin-platform.vercel.app
    │       Preview URLs on every branch/PR
    │
    └── Backend → Render (free web service)
            URL: https://algofin-api.onrender.com
            DB:  Render managed PostgreSQL (free)
            Redis: Upstash (free)
```

---

## Free Services Used

| Service | Plan | Purpose | Limits |
|---|---|---|---|
| **Vercel** | Hobby (free) | Next.js frontend | 100GB bandwidth/month |
| **Render** | Free web service | FastAPI backend | 512MB RAM, spins down after 15 min idle |
| **Render PostgreSQL** | Free | Database | 256MB storage, 90 days, 1 connection limit |
| **Upstash Redis** | Free | Celery broker + cache | 256MB, 10,000 req/day |
| **GitHub** | Free | Source control + CI/CD | Unlimited public repos |

> **⚠️ Free Tier Limitations:**
> - **Render cold start**: The backend takes ~30 seconds to wake up after 15 min of inactivity
> - **Render PostgreSQL**: Free tier expires after 90 days (must redeploy or upgrade)
> - **Upstash Redis**: 10,000 commands/day — enough for ~10 active users

---

## Required Accounts

Create accounts (all free) at:

1. **GitHub**: https://github.com — already have account `RiyazAnsariii`
2. **Vercel**: https://vercel.com — sign in with GitHub
3. **Render**: https://render.com — sign in with GitHub
4. **Upstash**: https://upstash.com — sign in with GitHub

---

## Step 1 — Push Dev Branch to Main

```bash
# Merge your dev branch to main
git checkout main
git merge dev
git push origin main
```

---

## Step 2 — Set Up Upstash Redis (5 min)

1. Go to https://console.upstash.com
2. Click **Create Database** → **Redis**
3. Name: `algofin-redis` | Region: nearest to you | Type: Regional
4. Click **Create**
5. Copy the **Redis URL** (format: `rediss://default:<password>@<endpoint>.upstash.io:6379`)

---

## Step 3 — Deploy Backend to Render (10 min)

1. Go to https://render.com → **New** → **Blueprint**
2. Connect to GitHub → select `RiyazAnsariii/algofin-platform`
3. Render will detect `algofin-backend/render.yaml` and create:
   - Web service: `algofin-api`
   - PostgreSQL database: `algofin-db`
4. After services are created, go to **algofin-api → Environment**
5. Set these variables manually (marked `sync: false` in render.yaml):

   | Variable | Value |
   |---|---|
   | `REDIS_URL` | Your Upstash Redis URL |
   | `CELERY_BROKER_URL` | Same as REDIS_URL but with `/1` at end |
   | `CELERY_RESULT_BACKEND` | Same as REDIS_URL but with `/2` at end |
   | `FERNET_KEY` | Run: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
   | `ALLOWED_ORIGINS` | `https://algofin-platform.vercel.app` (fill after Step 4) |
   | `GEMINI_API_KEY` | Your key from https://aistudio.google.com/app/apikey |
   | `GOOGLE_CLIENT_ID` | From Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
   | `GOOGLE_REDIRECT_URI` | `https://algofin-api.onrender.com/api/v1/auth/google/callback` |

6. Click **Save Changes** → **Manual Deploy**
7. Wait for build (~3-4 min). Check logs for `Tables created OK` and `Application startup complete`
8. Hit health endpoint: `https://algofin-api.onrender.com/health`

   Expected:
   ```json
   {"status":"ok","version":"2.0.0","database":"connected","redis":"connected"}
   ```

9. Copy the **Deploy Hook URL** from **Settings → Deploy Hooks** → save for GitHub Secrets

---

## Step 4 — Deploy Frontend to Vercel (5 min)

1. Go to https://vercel.com → **Add New Project**
2. Import `RiyazAnsariii/algofin-platform` from GitHub
3. **Root Directory**: `algofin-platform`
4. **Framework**: Next.js (auto-detected)
5. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://algofin-api.onrender.com`
6. Click **Deploy**
7. Note your URL: `https://algofin-platform.vercel.app` (or custom domain)

---

## Step 5 — Configure GitHub Actions Secrets (5 min)

Go to your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

Add these secrets:

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | Vercel → Settings → Tokens → Create |
| `VERCEL_ORG_ID` | Vercel → Settings → General → Team ID |
| `VERCEL_PROJECT_ID` | Vercel → Project → Settings → Project ID |
| `RENDER_DEPLOY_HOOK_URL` | Render → algofin-api → Settings → Deploy Hooks |

---

## Step 6 — Update ALLOWED_ORIGINS on Render

1. Copy your Vercel URL (e.g., `https://algofin-platform.vercel.app`)
2. Go to Render → algofin-api → Environment
3. Set `ALLOWED_ORIGINS` = `https://algofin-platform.vercel.app`
4. Save → Render redeploys automatically

---

## Step 7 — Verify End-to-End

```bash
# Health check
curl https://algofin-api.onrender.com/health

# Frontend
open https://algofin-platform.vercel.app
```

Try logging in and adding an exchange account.

---

## Development Workflow (Local)

### Windows — Double-click `dev.bat` or run:
```cmd
dev.bat
```

### Manual:
```bash
# Terminal 1 — Backend
cd algofin-backend
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd algofin-platform
npm run dev
```

Frontend: http://localhost:3000
Backend: http://localhost:8000
API Docs: http://localhost:8000/docs

---

## Deploy Flow After This Setup

Every `git push origin main` will:
1. Run lint + type check (GitHub Actions)
2. Build frontend and deploy to Vercel (automatic)
3. Trigger Render redeploy via webhook
4. Render runs `alembic upgrade head` then restarts the server

Every PR/branch push creates a **Vercel Preview URL** automatically.

---

## Running Alembic Migrations

### Local (SQLite):
```bash
cd algofin-backend
python -m alembic upgrade head       # apply all migrations
python -m alembic downgrade -1       # rollback one step
python -m alembic revision --autogenerate -m "add_new_table"  # generate new migration
```

### Production (PostgreSQL on Render):
Migrations run automatically on every deploy via the `startCommand` in `render.yaml`:
```
python -m alembic upgrade head && uvicorn ...
```

To run manually: Go to Render → algofin-api → Shell:
```bash
python -m alembic upgrade head
```

---

## Rollback Steps

### Frontend Rollback (Vercel):
1. Go to Vercel → algofin-platform → Deployments
2. Find the last working deployment
3. Click **···** → **Promote to Production**

### Backend Rollback (Render):
1. Go to Render → algofin-api → Events
2. Click **Rollback** on any previous deploy
3. If DB migration needs rollback:
   ```bash
   # In Render Shell:
   python -m alembic downgrade -1
   ```

---

## Troubleshooting

### Backend cold start (30s delay)
The Render free tier spins down after 15 min of inactivity. First request after idle will take ~30 seconds. This is normal for the free tier.

**Fix**: Upgrade to Render Starter ($7/month) for always-on, or use a cron job to ping `/health` every 10 min:
- Use https://cron-job.org (free) to `GET https://algofin-api.onrender.com/health` every 14 minutes

### `database: unreachable` in /health
- Check Render → algofin-db → Status
- Check `DATABASE_URL` environment variable format
- Render PostgreSQL free tier may need `?sslmode=require` at the end of the URL

### CORS errors in browser
- Check `ALLOWED_ORIGINS` on Render matches your exact Vercel URL
- No trailing slash in the URL
- Must be HTTPS in production

### Vercel build fails
- Check `NEXT_PUBLIC_API_URL` is set in Vercel project environment variables
- Check TypeScript errors: run `npx tsc --noEmit` locally first

### Redis connection refused
- Check `REDIS_URL` is the Upstash `rediss://` URL (with TLS)
- Upstash free tier uses port 6379 with TLS (`rediss://` not `redis://`)

### Google OAuth `redirect_uri_mismatch`
- Go to Google Cloud Console → Credentials → your OAuth app
- Add `https://algofin-api.onrender.com/api/v1/auth/google/callback` to Authorized redirect URIs
- Add `https://algofin-platform.vercel.app` to Authorized JavaScript origins

---

## Final URLs (after deployment)

| Service | URL |
|---|---|
| Frontend | https://algofin-platform.vercel.app |
| Backend | https://algofin-api.onrender.com |
| Health | https://algofin-api.onrender.com/health |
| API Docs | https://algofin-api.onrender.com/docs |
| GitHub | https://github.com/RiyazAnsariii/algofin-platform |
