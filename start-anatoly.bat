@echo off
title Incident Management Live Dashboard - Anatoly Server
cd /d "%~dp0"

echo =====================================================================
echo   Starting Incident Management Live Ticket Dashboard on Anatoly
echo =====================================================================
echo.

REM Verify Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js LTS from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] Installing project dependencies...
    call npm install
)

REM Check if production build exists
if not exist ".next\" (
    echo [INFO] Building production application...
    call npm run build
)

echo.
echo =====================================================================
echo   DASHBOARD READY FOR LOCAL NETWORK (LAN - NO VPN NEEDED)
echo =====================================================================
echo.
powershell -NoProfile -Command "Write-Host 'Server Local IP addresses:'; (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254*' }).IPAddress | ForEach-Object { Write-Host '  --> http://' $_ ':3000/public-dashboard' -ForegroundColor Green }"
echo.
echo Press Ctrl+C in this window to stop the server.
echo =====================================================================
echo.

npm run start
pause

