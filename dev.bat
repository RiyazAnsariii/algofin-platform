@echo off
:: AlgoFin — Local Development Launcher (Windows Batch)
:: Double-click this file OR run it from any terminal.
:: It auto-navigates to the AlgoFin folder and starts both servers.

:: ── Change to the directory where this .bat lives ────────────────────────────
cd /d "%~dp0"

:: ── Check PowerShell is available ────────────────────────────────────────────
where powershell >nul 2>&1
if errorlevel 1 (
    echo ERROR: PowerShell not found. Please install PowerShell.
    pause
    exit /b 1
)

:: ── Run dev.ps1 with ExecutionPolicy Bypass (no admin needed) ────────────────
:: -ExecutionPolicy Bypass  : runs the script even if policy blocks .ps1 files
:: -NoProfile               : skips loading $PROFILE (faster startup)
:: -File                    : runs as a script file (not inline command)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1"

pause
