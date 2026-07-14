# AlgoFin -- Local Development Launcher
# HOW TO RUN: double-click dev.bat  (from any folder)
# OR from the AlgoFin\ directory:  powershell -ExecutionPolicy Bypass -File dev.ps1

$ErrorActionPreference = "Stop"

# Auto-navigate to this script's folder (works from any terminal location)
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
Set-Location $scriptDir

$backend  = Join-Path $scriptDir "algofin-backend"
$frontend = Join-Path $scriptDir "algofin-platform"

# ---------------------------------------------------------------------------
# Check required tools
# ---------------------------------------------------------------------------
foreach ($tool in @("python", "npm")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: '$tool' not found in PATH. Install it and try again." -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

Write-Host ""
Write-Host "AlgoFin Dev Environment" -ForegroundColor Cyan
Write-Host "  Frontend  ->  http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend   ->  http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs  ->  http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# Auto-create .env files from examples if missing
# ---------------------------------------------------------------------------
$backendEnv  = Join-Path $backend ".env"
$frontendEnv = Join-Path $frontend ".env.local"

if (-not (Test-Path $backendEnv)) {
    Write-Host "INFO: Backend .env not found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item (Join-Path $backend ".env.example") $backendEnv
}

if (-not (Test-Path $frontendEnv)) {
    Write-Host "INFO: Frontend .env.local not found. Copying from .env.local.example..." -ForegroundColor Yellow
    Copy-Item (Join-Path $frontend ".env.local.example") $frontendEnv
}

# ---------------------------------------------------------------------------
# Auto-generate FERNET_KEY if blank
# ---------------------------------------------------------------------------
$envContent = Get-Content $backendEnv -Raw
if ($envContent -match 'FERNET_KEY=\s*[\r\n]') {
    Write-Host "INFO: Generating FERNET_KEY..." -ForegroundColor Yellow
    $fernetKey = python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    $envContent = $envContent -replace 'FERNET_KEY=[\s]*', "FERNET_KEY=$fernetKey`r`n"
    Set-Content $backendEnv $envContent -NoNewline
    Write-Host "OK: FERNET_KEY written to algofin-backend\.env" -ForegroundColor Green
}

# ---------------------------------------------------------------------------
# Start Backend (FastAPI)
# ---------------------------------------------------------------------------
Write-Host "Starting FastAPI backend on :8000 ..." -ForegroundColor Green
$backendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    $env:PYTHONPATH = $dir
    python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir app
} -ArgumentList $backend

# ---------------------------------------------------------------------------
# Start Frontend (Next.js)
# ---------------------------------------------------------------------------
Write-Host "Starting Next.js frontend on :3000 ..." -ForegroundColor Green
$frontendJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npx next dev --port 3000
} -ArgumentList $frontend

# ---------------------------------------------------------------------------
# Wait for frontend, then open browser
# ---------------------------------------------------------------------------
Write-Host "Waiting for Next.js to compile (this takes ~10 seconds first time)..." -ForegroundColor Gray
$ready    = $false
$attempts = 0
while (-not $ready -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($r.StatusCode -eq 200) { $ready = $true }
    } catch { }
}

if ($ready) {
    Write-Host "Frontend ready! Opening browser..." -ForegroundColor Green
    Start-Process "http://localhost:3000"
} else {
    Write-Host "Frontend still compiling. Open http://localhost:3000 manually in a moment." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Both servers are running. Press Ctrl+C to stop everything." -ForegroundColor Cyan
Write-Host ""

# ---------------------------------------------------------------------------
# Stream logs until Ctrl+C
# ---------------------------------------------------------------------------
try {
    while ($true) {
        $bo = Receive-Job $backendJob  -ErrorAction SilentlyContinue
        $fo = Receive-Job $frontendJob -ErrorAction SilentlyContinue
        if ($bo) { $bo | ForEach-Object { Write-Host "[Backend]  $_" -ForegroundColor DarkCyan } }
        if ($fo) { $fo | ForEach-Object { Write-Host "[Frontend] $_" -ForegroundColor Magenta } }
        if ($backendJob.State  -eq "Failed") { Write-Host "ERROR: Backend crashed. See log above." -ForegroundColor Red }
        if ($frontendJob.State -eq "Failed") { Write-Host "ERROR: Frontend crashed. See log above." -ForegroundColor Red }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host ""
    Write-Host "Stopping servers..." -ForegroundColor Yellow
    Stop-Job  $backendJob, $frontendJob -ErrorAction SilentlyContinue
    Remove-Job $backendJob, $frontendJob -Force -ErrorAction SilentlyContinue
    Write-Host "All servers stopped." -ForegroundColor Green
}
