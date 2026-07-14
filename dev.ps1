#!/usr/bin/env pwsh
# AlgoFin — Local Development Launcher
# Usage:  .\dev.ps1
#
# Starts both the FastAPI backend (port 8000) and Next.js frontend (port 3000)
# in separate PowerShell windows and opens the browser automatically.
#
# Prerequisites (run once):
#   pip install -r algofin-backend\requirements.txt
#   npm install  (inside algofin-platform\)

$ErrorActionPreference = "Stop"

# ── Resolve paths ─────────────────────────────────────────────────────────────
$root    = $PSScriptRoot
$backend = Join-Path $root "algofin-backend"
$frontend = Join-Path $root "algofin-platform"

# ── Check required tools ──────────────────────────────────────────────────────
function Check-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "❌ '$name' not found in PATH. Install it first." -ForegroundColor Red
        exit 1
    }
}
Check-Command "python"
Check-Command "uvicorn"
Check-Command "npm"

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║        AlgoFin  Dev  Environment                   ║" -ForegroundColor Cyan
Write-Host "╠════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Frontend  →  http://localhost:3000                 ║" -ForegroundColor Cyan
Write-Host "║  Backend   →  http://localhost:8000                 ║" -ForegroundColor Cyan
Write-Host "║  API Docs  →  http://localhost:8000/docs            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ── Check .env files exist ────────────────────────────────────────────────────
$backendEnv  = Join-Path $backend ".env"
$frontendEnv = Join-Path $frontend ".env.local"

if (-not (Test-Path $backendEnv)) {
    Write-Host "⚠️  Backend .env not found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item (Join-Path $backend ".env.example") $backendEnv
    Write-Host "   → Edit algofin-backend\.env and set FERNET_KEY before continuing." -ForegroundColor Yellow
}

if (-not (Test-Path $frontendEnv)) {
    Write-Host "⚠️  Frontend .env.local not found. Copying from .env.local.example..." -ForegroundColor Yellow
    Copy-Item (Join-Path $frontend ".env.local.example") $frontendEnv
}

# ── Generate FERNET_KEY if missing ───────────────────────────────────────────
$envContent = Get-Content $backendEnv -Raw
if ($envContent -match "FERNET_KEY=\s*$" -or $envContent -match "FERNET_KEY=`r?`n") {
    Write-Host "🔑 Generating FERNET_KEY..." -ForegroundColor Yellow
    $fernetKey = python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    (Get-Content $backendEnv) -replace "FERNET_KEY=.*", "FERNET_KEY=$fernetKey" |
        Set-Content $backendEnv
    Write-Host "   ✅ FERNET_KEY set in algofin-backend\.env" -ForegroundColor Green
}

# ── Start Backend ─────────────────────────────────────────────────────────────
Write-Host "🚀 Starting FastAPI backend on :8000 ..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    $env:PYTHONPATH = $dir
    uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
} -ArgumentList $backend

# ── Start Frontend ────────────────────────────────────────────────────────────
Write-Host "⚡ Starting Next.js frontend on :3000 ..." -ForegroundColor Green
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm run dev
} -ArgumentList $frontend

# ── Wait for frontend to be ready, then open browser ─────────────────────────
Write-Host "⏳ Waiting for Next.js to be ready..." -ForegroundColor Gray
$ready = $false
$attempts = 0
while (-not $ready -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) { $ready = $true }
    } catch { <# still starting #> }
}

if ($ready) {
    Write-Host "✅ Frontend ready! Opening browser..." -ForegroundColor Green
    Start-Process "http://localhost:3000"
} else {
    Write-Host "ℹ️  Frontend might still be compiling. Open http://localhost:3000 manually." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📌 Press Ctrl+C to stop all servers." -ForegroundColor Cyan
Write-Host ""

# ── Stream logs ───────────────────────────────────────────────────────────────
try {
    while ($true) {
        # Print any new output from either job
        $backendOutput  = Receive-Job $backendJob  -ErrorAction SilentlyContinue
        $frontendOutput = Receive-Job $frontendJob -ErrorAction SilentlyContinue

        if ($backendOutput)  { $backendOutput  | ForEach-Object { Write-Host "[Backend]  $_" -ForegroundColor DarkCyan } }
        if ($frontendOutput) { $frontendOutput | ForEach-Object { Write-Host "[Frontend] $_" -ForegroundColor DarkMagenta } }

        # Check if either job died
        if ($backendJob.State  -eq "Failed") { Write-Host "❌ Backend crashed. Check logs above." -ForegroundColor Red }
        if ($frontendJob.State -eq "Failed") { Write-Host "❌ Frontend crashed. Check logs above." -ForegroundColor Red }

        Start-Sleep -Milliseconds 500
    }
} finally {
    # Ctrl+C — clean up both jobs
    Write-Host ""
    Write-Host "🛑 Stopping servers..." -ForegroundColor Yellow
    Stop-Job  $backendJob,  $frontendJob  -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $frontendJob  -Force -ErrorAction SilentlyContinue
    Write-Host "✅ All servers stopped." -ForegroundColor Green
}
