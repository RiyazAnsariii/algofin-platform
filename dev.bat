@echo off
title AlgoFin Dev Launcher
color 0A

:: ── Navigate to this script's folder ─────────────────────────────────────────
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

:: ── Kill any existing processes on :3000 and :8000 ───────────────────────────
echo  Cleaning up old server processes...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo  Ports cleared.
echo.

:: ── Launch Backend in its own Cyan window ────────────────────────────────────
start "AlgoFin Backend :8000" cmd /k ^
  "color 0B && title AlgoFin Backend :8000 && cd /d %~dp0algofin-backend && echo. && echo  [BACKEND] FastAPI on http://localhost:8000 && echo  [BACKEND] API Docs on http://localhost:8000/docs && echo. && python -m uvicorn app.main:app --reload --port 8000 --reload-dir app"

:: ── Launch Frontend in its own Magenta window ────────────────────────────────
start "AlgoFin Frontend :3000" cmd /k ^
  "color 0D && title AlgoFin Frontend :3000 && cd /d %~dp0algofin-platform && echo. && echo  [FRONTEND] Next.js on http://localhost:3000 && echo. && npm run dev"

:: ── Wait for Next.js first compile, then open browser ────────────────────────
echo  Waiting for Next.js to start (first compile takes ~10 seconds)...
echo.

:wait_loop
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command ^
  "try { $r=(Invoke-WebRequest http://localhost:3000 -UseBasicParsing -TimeoutSec 2).StatusCode; if($r -eq 200){exit 0} } catch {}; exit 1" >nul 2>&1
if errorlevel 1 goto wait_loop

echo  Opening http://localhost:3000 in your browser...
start "" "http://localhost:3000"
echo.
echo  =====================================================
echo    Both servers are running!
echo.
echo    Close the Backend / Frontend windows to stop.
echo    Or press any key here to close this launcher.
echo  =====================================================
echo.
pause >nul
