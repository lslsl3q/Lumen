@echo off
REM Lumen AI Frontend Startup Script
REM Check backend and start Tauri app

REM Set UTF-8 encoding
chcp 65001 >nul

echo ========================================
echo Lumen AI Frontend Startup Script
echo ========================================
echo.

echo [1/2] Checking Backend API...
curl -s http://127.0.0.1:8888/docs > nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Backend API is running (http://127.0.0.1:8888)
) else (
    echo [ERROR] Backend API is not running, please start:
    echo   cd F:\AI\tools\VCP\Lumen
    echo   Start backend.bat
    pause
    exit /b 1
)

echo.
echo [2/2] Starting Frontend Application...
echo Starting Tauri application...
cd /d "%~dp0"
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
pnpm tauri dev

pause
