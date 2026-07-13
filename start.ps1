#!/usr/bin/env pwsh
# AlgoFin v1 — Full Stack Startup Script (Windows PowerShell)
# Starts: Docker (PostgreSQL + Redis + FastAPI + Celery) + Next.js dev server
#
# Prerequisites:
#   - Docker Desktop running
#   - Node.js 18+ installed
#   - .env file in algofin-backend/ with all required variables

param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$Stop
)

$Root = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $Root "algofin-backend"
$FrontendDir = Join-Path $Root "algofin-platform"

function Write-Header($msg) {
    Write-Host ""
    Write-Host "  ══ $msg ══" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "  ✓ $msg" -ForegroundColor Green
}

function Write-Warn($msg) {
    Write-Host "  ⚠ $msg" -ForegroundColor Yellow
}

function Write-Err($msg) {
    Write-Host "  ✗ $msg" -ForegroundColor Red
}

# ── Stop all services ─────────────────────────────────────────────
if ($Stop) {
    Write-Header "Stopping AlgoFin services"
    Set-Location $BackendDir
    docker-compose down
    Write-Ok "Docker services stopped"
    Write-Warn "Next.js dev server must be stopped manually (Ctrl+C in its terminal)"
    exit 0
}

Write-Host ""
Write-Host "  AlgoFin v1 — Starting up" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray

# ── Validate .env ──────────────────────────────────────────────────
$envFile = Join-Path $BackendDir ".env"
if (-not (Test-Path $envFile)) {
    Write-Err ".env file not found at: $envFile"
    Write-Warn "Copy .env.example and fill in: SECRET_KEY, FERNET_KEY, GEMINI_API_KEY"
    exit 1
}

$envContent = Get-Content $envFile -Raw

$required = @("SECRET_KEY", "FERNET_KEY", "GEMINI_API_KEY")
foreach ($key in $required) {
    if ($envContent -notmatch "${key}=.+") {
        Write-Err "Missing required env var: $key"
        Write-Warn "Edit $envFile and add: $key=<value>"
        exit 1
    }
}
Write-Ok ".env validated"

# ── Backend (Docker Compose) ──────────────────────────────────────
if (-not $FrontendOnly) {
    Write-Header "Starting backend (Docker)"

    if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
        Write-Err "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
        exit 1
    }

    Set-Location $BackendDir

    Write-Host "  Building images (first run may take 2-3 min)..." -ForegroundColor DarkGray
    docker-compose up -d --build

    if ($LASTEXITCODE -ne 0) {
        Write-Err "docker-compose failed. Check Docker Desktop is running."
        exit 1
    }
    Write-Ok "Docker containers started"

    # Run migrations
    Write-Host "  Running Alembic migrations..." -ForegroundColor DarkGray
    Start-Sleep -Seconds 5  # Wait for postgres to be ready
    docker-compose exec -T api alembic upgrade head

    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Database migrations applied"
    } else {
        Write-Warn "Migration failed — may already be up to date"
    }

    Write-Ok "Backend ready at: http://localhost:8000"
    Write-Ok "API docs at:      http://localhost:8000/docs"
}

# ── Frontend (Next.js) ────────────────────────────────────────────
if (-not $BackendOnly) {
    Write-Header "Starting frontend (Next.js)"

    if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
        Write-Host "  Installing npm dependencies..." -ForegroundColor DarkGray
        Set-Location $FrontendDir
        npm install
    }

    Write-Ok "Starting Next.js dev server in new terminal..."

    # Start Next.js in a new PowerShell window
    Start-Process pwsh -ArgumentList "-NoExit", "-Command", "Set-Location '$FrontendDir'; npm run dev" -WindowStyle Normal
    Start-Sleep -Seconds 3
    Write-Ok "Frontend started at: http://localhost:3000"
}

# ── Summary ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "  AlgoFin v1 is running" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:    http://localhost:3000" -ForegroundColor White
Write-Host "  Backend API: http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:    http://localhost:8000/docs" -ForegroundColor White
Write-Host "  DB:          localhost:5432 (algofin / see .env)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  To stop: .\start.ps1 -Stop" -ForegroundColor DarkGray
Write-Host ""
