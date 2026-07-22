@echo off
title AlgoFin Dev
color 0A
cd /d "%~dp0"

echo.
echo  =====================================================
echo    AlgoFin v2  ^|  One-Click Dev Launcher
echo  =====================================================
echo.
echo  Backend  -^>  http://localhost:8000
echo  Frontend -^>  http://localhost:3000
echo  API Docs -^>  http://localhost:8000/docs
echo.

:: ── Kill stale processes ───────────────────────────────────────────
echo  Cleaning up old processes on :3000 and :8000...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo  Done. Starting servers...
echo.

:: ── Start backend in background (hidden, logs to backend.log) ─────
start /B "" cmd /c "cd /d %~dp0algofin-backend && python -m uvicorn app.main:app --reload --port 8000 --reload-dir app > ..\backend.log 2>&1"

:: ── Wait for backend to be ready ──────────────────────────────────
echo  [1/2] Waiting for backend...
:wait_backend
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command ^
  "try { $r=(Invoke-WebRequest http://localhost:8000/health -UseBasicParsing -TimeoutSec 2).StatusCode; if($r -eq 200){exit 0} } catch {}; exit 1" >nul 2>&1
if errorlevel 1 goto wait_backend
echo  [1/2] Backend ready  -^>  http://localhost:8000
echo.

:: ── Start frontend in THIS window (so you see Next.js output here) ─
echo  [2/2] Starting Next.js frontend...
echo.
echo  =====================================================
echo    Both servers are running!
echo    Frontend logs shown below.
echo    Press Ctrl+C to stop everything.
echo  =====================================================
echo.

:: Open browser after 8 seconds in background
start /B "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 8; Start-Process 'http://localhost:3000'"

:: Run frontend in foreground — you see its output directly here
cd /d "%~dp0algofin-platform"
npm run dev
