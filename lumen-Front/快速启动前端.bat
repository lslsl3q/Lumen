@echo off
REM Lumen AI Quick Frontend Start
REM Start Tauri frontend without backend check

REM Set UTF-8 encoding
chcp 65001 >nul
title Lumen AI - Tauri 2
cd /d "%~dp0"

echo ========================================
echo   Lumen AI Frontend (Tauri 2)
echo ========================================
echo.
echo Installing dependencies...
pnpm install

echo.
echo Starting development environment...
pnpm tauri dev

pause
