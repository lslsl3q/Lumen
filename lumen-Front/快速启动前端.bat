@echo off
REM Lumen AI Quick Frontend Start
REM Start Tauri frontend without backend check

REM Ensure window stays open on any error
if "%~1"=="" (
    cmd /k "%~f0" keep
    exit /b
)

REM Set UTF-8 encoding
chcp 65001 >nul
title Lumen AI - Tauri 2
cd /d "%~dp0"

echo ========================================
echo   Lumen AI Frontend (Tauri 2)
echo ========================================
echo.

echo [1/2] Checking dependencies...
call pnpm install
if errorlevel 1 (
    echo.
    echo [ERROR] pnpm install failed
    echo   Try: set HTTP_PROXY=http://127.0.0.1:7897
    echo.
    pause
    exit /b 1
)

echo.
echo [2/2] Starting development environment...
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
call pnpm tauri dev 2>&1

echo.
echo ========================================
echo   Process exited (code: %errorlevel%)
echo ========================================
pause
