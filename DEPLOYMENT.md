# AlgoFin — Free-Tier Deployment Guide

## Architecture Overview

```
GitHub (main branch)
    │
    ├── Push → GitHub Actions CI   ← configured in .github/workflows/deploy.yml
    │       ├── lint/type-check (backend + frontend)
    │       ├── Deploy frontend → Vercel (automatic, via Vercel CLI)
    │       └── Trigger redeploy → Render (via deploy hook webhook)
    │
    ├── Frontend → Vercel (free hobby plan)
    │       URL: https://<your-project-name>.vercel.app   ← assigned at deploy time
    │       Preview URL on every branch push and PR
    │
    └── Backend → Render (free web service)
            URL: https://<your-service-name>.onrender.com  ← assigned at deploy time
            DB:  Neon PostgreSQL (free, external)
            Redis: Upstash (free, external)
```

> **ℹ️ URLs above are examples.** Your actual URLs depend on the service
> names available at the time you deploy. Render and Vercel both let you
> set a custom subdomain after deploy.

---

## Free Services Used

| Service | Plan | Purpose | Key Limits |
|---|---|---|---|
| **Vercel** | Hobby (free) | Next.js frontend hosting | 100GB bandwidth/month, preview deployments |
| **Render** | Free web service | FastAPI backend | 512MB RAM, **spins down after 15 min idle** |
| **Neon** | Free (Serverless) | PostgreSQL database | 0.5GB storage, 190 compute hours/month |
| **Upstash** | Free | Redis (Celery broker + cache) | 256MB, **10,000 commands/day** |
| **GitHub** | Free | Source control + CI/CD | Unlimited public repos, 2,000 CI min/month |

> **⚠️ Free Tier Limitations — Read Before Deploying:**
>
> - **Render cold start**: The backend can take **30–90 seconds** to wake
>   up after 15 min of inactivity (varies by server load). First page load
>   after idle will feel slow. This is a hard limit of the free tier.
>
> - **Upstash 10,000 req/day**: With Celery workers, Redis cache, rate
>   limiting, and health checks all running simultaneously, this can be
>   reached faster than expected. Monitor usage in the Upstash console.
>   For development and low-traffic use it is sufficient. For more than
>   ~5 concurrent users, consider the $10/month Upstash Pay-as-you-go plan.
>
> - **Neon compute hours**: Free tier includes 190 compute hours/month.
>   Neon scales to zero when idle (no queries). For light dev use this
>   is plenty. Heavy continuous load may exhaust the quota.
>
> - **Render free tier policy**: Render's free plan terms have changed
>   before and may change again. The web service free tier is currently
>   stable. The managed PostgreSQL free tier was **discontinued** — that
>   is why this guide uses Neon instead.

---

## Required Accounts

Create free accounts at (no credit card required for any of these):

| Account | URL | Sign-in method |
|---|---|---|
| **GitHub** | https://github.com | Already have: `RiyazAnsariii` |
| **Vercel** | https://vercel.com | Sign in with GitHub |
| **Render** | https://render.com | Sign in with GitHub |
| **Neon** | https://neon.tech | Sign in with GitHub |
| **Upstash** | https://upstash.com | Sign in with GitHub |

---

## Prerequisites Already Configured

The following files are already in the repo — no manual setup needed:

| File | Purpose |
|---|---|
| `.github/workflows/deploy.yml` | CI/CD — lint, build, deploy to Vercel + Render |
| `algofin-backend/render.yaml` | Render service definition (detected automatically) |
| `algofin-platform/vercel.json` | Vercel build config + API proxy rewrite |
| `algofin-backend/Dockerfile` | Docker image (used by Render) |
| `algofin-backend/alembic/` | Database migrations (runs automatically on deploy) |

---

## Step 1 — Push to GitHub

```bash
git checkout main
git merge dev
git push origin main
```

You must be on `main` for Render and Vercel to trigger production deploys.

---

## Step 2 — Create Neon PostgreSQL Database (5 min)

Render's free PostgreSQL tier has been discontinued. Use Neon instead —
it is free, requires no credit card, and does not expire.

1. Go to **https://neon.tech** → Sign in with GitHub
2. Click **New Project** → Name: `algofin` → Region: nearest to you
3. Click **Create Project**
4. On the dashboard, find **Connection string** → select **asyncpg** driver
5. Copy the URL — it looks like:
   ```
   postgresql+asyncpg://user:password@ep-xxx-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
6. Save this — you will paste it as `DATABASE_URL` on Render

---

## Step 3 — Create Upstash Redis (5 min)

1. Go to **https://console.upstash.com** → Sign in with GitHub
2. Click **Create Database** → Redis
3. Name: `algofin-redis` | Type: **Regional** | Region: nearest to you
4. Click **Create**
5. On the database page, copy the **Redis URL** — it looks like:
   ```
   rediss://default:<password>@<endpoint>.upstash.io:6379
   ```
   > Note: `rediss://` (with double-s) = TLS. Required by Upstash.

6. Save this — you will use it as `REDIS_URL`, `CELERY_BROKER_URL`, and
   `CELERY_RESULT_BACKEND` on Render.

---

## Step 4 — Deploy Backend to Render (10 min)

1. Go to **https://render.com** → **New → Blueprint**
2. Connect GitHub → select `RiyazAnsariii/algofin-platform`
3. Render detects `algofin-backend/render.yaml` and creates: **algofin-api** (web service)
4. After the service is created, go to **algofin-api → Environment**
5. Add these variables (all marked `sync: false` in render.yaml):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Your Neon asyncpg connection string (Step 2) |
   | `REDIS_URL` | Your Upstash `rediss://` URL (Step 3) |
   | `CELERY_BROKER_URL` | Same Upstash URL + `/1` at the end |
   | `CELERY_RESULT_BACKEND` | Same Upstash URL + `/2` at the end |
   | `FERNET_KEY` | Run: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
   | `ALLOWED_ORIGINS` | Fill in after Step 5 (your Vercel URL) |
   | `GEMINI_API_KEY` | Your key from https://aistudio.google.com/app/apikey |
   | `GOOGLE_CLIENT_ID` | Optional — from Google Cloud Console |
   | `GOOGLE_CLIENT_SECRET` | Optional — from Google Cloud Console |
   | `GOOGLE_REDIRECT_URI` | `https://<your-render-url>/api/v1/auth/google/callback` |

6. Click **Save Changes** → Render will start the first deploy
7. Wait for the build log to show:
   ```
   INFO  [alembic] Running upgrade -> xxxx, initial_schema
   INFO  Application startup complete.
   ```
8. Note your Render URL (shown in the dashboard, e.g., `https://algofin-api-xxxx.onrender.com`)
9. Test it:
   ```bash
   curl https://<your-render-url>/health
   ```
   Expected:
   ```json
   {"status":"ok","version":"2.0.0","database":"connected","redis":"connected"}
   ```
10. Copy the **Deploy Hook URL**: **Settings → Deploy Hooks → Create Hook**
    Save this for GitHub Secrets (Step 6).

---

## Step 5 — Deploy Frontend to Vercel (5 min)

1. Go to **https://vercel.com** → **Add New → Project**
2. Import `RiyazAnsariii/algofin-platform` from GitHub
3. Set **Root Directory** to `algofin-platform`
4. Framework: **Next.js** (auto-detected)
5. Add environment variable:
   - `NEXT_PUBLIC_API_URL` = `https://<your-render-url>` (from Step 4)
6. Click **Deploy**
7. Vercel assigns a URL like `https://algofin-platform-xxxx.vercel.app`
   You can set a custom subdomain under **Settings → Domains**

---

## Step 6 — Update ALLOWED_ORIGINS on Render

Now that you have your Vercel URL:

1. Render → **algofin-api → Environment**
2. Set `ALLOWED_ORIGINS` = `https://<your-vercel-url>`  (no trailing slash)
3. Save → Render redeploys automatically

---

## Step 7 — Configure GitHub Actions Secrets (2 min)

Go to **GitHub → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Where to get it |
|---|---|
| `VERCEL_TOKEN` | Vercel → Settings → Tokens → **Create** |
| `VERCEL_ORG_ID` | Vercel → Settings → General → **Team ID** |
| `VERCEL_PROJECT_ID` | Vercel → your project → Settings → **Project ID** |
| `RENDER_DEPLOY_HOOK_URL` | Render → algofin-api → Settings → **Deploy Hooks** |

After this, every `git push origin main` will:
- Run lint + build checks
- Auto-deploy frontend to Vercel
- Trigger Render to redeploy the backend

---

## Local Development

### Windows — double-click `dev.bat` or run:
```cmd
dev.bat
```

### Manual (any OS):
```bash
# Terminal 1 — Backend
cd algofin-backend
python -m uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd algofin-platform
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

---

## Alembic Migrations

### Generate a new migration (local):
```bash
cd algofin-backend
python -m alembic revision --autogenerate -m "describe_your_change"
```

### Apply migrations locally:
```bash
python -m alembic upgrade head
```

### Rollback one step locally:
```bash
python -m alembic downgrade -1
```

### Production migrations:
Migrations run **automatically** on every Render deploy via the start command:
```
python -m alembic upgrade head && uvicorn ...
```

To run manually on production, use the **Render Shell**:
```bash
python -m alembic upgrade head
```

---

## Rollback Steps

### Frontend (Vercel):
1. Vercel → your project → **Deployments**
2. Find the last working deployment
3. Click **···** → **Promote to Production**

### Backend (Render):
1. Render → algofin-api → **Events**
2. Click **Rollback** next to any previous deploy

### Database migration rollback:
```bash
# In Render Shell:
python -m alembic downgrade -1
# Then rollback the Render deploy (above)
```

---

## Troubleshooting

### Backend takes 30–90 seconds to respond after idle
This is expected on the Render free tier — the service spins down after
15 min of no traffic. The first request after idle triggers a cold start.

**Options:**
- Accept it for a dev/portfolio project (most people do)
- Use a free cron service to keep it warm — note that this is a workaround
  and Render's free tier terms do not explicitly prohibit it, but it uses
  your monthly free hours faster:
  - **https://cron-job.org** (free) — ping `/health` every 14 minutes

### `database: unreachable` in /health
- Check `DATABASE_URL` on Render includes `?sslmode=require` at the end
- Neon requires TLS. The asyncpg URL must start with `postgresql+asyncpg://`
- Check Neon dashboard — the project may have been paused (rare on free tier)

### CORS errors in browser console
- Check `ALLOWED_ORIGINS` on Render exactly matches your Vercel URL
- No trailing slash. Must be HTTPS in production.

### Upstash `redis: unreachable` in /health
- The Upstash URL must use `rediss://` (double-s = TLS), not `redis://`
- Check the URL was copied correctly from the Upstash console

### Vercel build fails in GitHub Actions
- Check `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` are all set
  in GitHub Secrets (Settings → Secrets → Actions)
- Check the Vercel project root is set to `algofin-platform`

### Google OAuth `redirect_uri_mismatch`
1. Go to **Google Cloud Console → Credentials → your OAuth 2.0 Client**
2. Add to **Authorized redirect URIs**:
   ```
   https://<your-render-url>/api/v1/auth/google/callback
   ```
3. Add to **Authorized JavaScript origins**:
   ```
   https://<your-vercel-url>
   ```

---

## Final Checklist

- [ ] Neon database created and `DATABASE_URL` set on Render
- [ ] Upstash Redis created and `REDIS_URL` / `CELERY_*` URLs set on Render
- [ ] `FERNET_KEY` set on Render
- [ ] `GEMINI_API_KEY` set on Render
- [ ] Backend health endpoint returns `{"database":"connected","redis":"connected"}`
- [ ] Frontend deployed to Vercel and loads the login page
- [ ] `ALLOWED_ORIGINS` on Render set to your Vercel URL
- [ ] GitHub Secrets configured (Vercel token + Render deploy hook)
- [ ] Test push to `main` triggers both Vercel + Render deploys

---

## Cost Summary

| Scenario | Monthly Cost |
|---|---|
| Dev/portfolio with < 5 users | **$0** |
| Light production (Upstash upgrade) | ~$10/month |
| Always-on backend (Render Starter) | ~$7/month |
| Full production (all upgrades) | ~$17/month |
