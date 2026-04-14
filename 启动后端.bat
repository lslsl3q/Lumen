@echo off
REM Lumen AI Backend Startup Script (Windows)
REM Start FastAPI service for Tauri desktop app

REM Change to script directory
cd /d "%~dp0"

REM Set UTF-8 encoding
chcp 65001 >nul

echo ========================================
echo   Starting Lumen AI Backend...
echo ========================================
echo.

REM Check virtual environment
if not exist ".venv\Scripts\python.exe" (
    echo ========================================
    echo   Virtual Environment Not Found
    echo ========================================
    echo.
    echo Please create virtual environment first:
    echo.
    echo   python -m venv .venv
    echo   .venv\Scripts\activate
    echo   pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

REM Start FastAPI service
echo FastAPI service starting...
echo.
echo API Address: http://127.0.0.1:8888
echo API Docs: http://127.0.0.1:8888/docs
echo.
echo Press Ctrl+C to stop service
echo.

.venv\Scripts\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8888

REM Handle exit
if %errorlevel% neq 0 (
    echo.
    echo ========================================
    echo   Program Exited with Error
    echo ========================================
    echo.
)

pause
