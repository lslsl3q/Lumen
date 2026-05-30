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
curl -sf http://127.0.0.1:8888/docs -o nul 2>nul && (
    echo [OK] Backend API is running
) || (
    echo [ERROR] Backend API is not running
    echo   Please start: 启动后端.bat
    echo.
    pause
    exit /b 1
)

echo.
echo [2/2] Starting Frontend Application...
cd /d "%~dp0"
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
pnpm tauri dev 2>&1

echo.
echo ========================================
echo   Process exited (code: %errorlevel%)
echo ========================================
pause
