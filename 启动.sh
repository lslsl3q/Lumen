#!/bin/bash
# Lumen AI Backend Startup Script (Linux/Mac)
# Start FastAPI service for Tauri desktop app

# Change to script directory
cd "$(dirname "$0")"

# ========================================
# Check virtual environment
# ========================================
if [ ! -f ".venv/bin/python" ]; then
    echo ""
    echo "========================================"
    echo "  Virtual Environment Not Found"
    echo "========================================"
    echo ""
    echo "Please create virtual environment first:"
    echo ""
    echo "  python3 -m venv .venv"
    echo "  source .venv/bin/activate"
    echo "  pip install -r requirements.txt"
    echo ""
    exit 1
fi

# ========================================
# Start FastAPI service
# ========================================
echo ""
echo "========================================"
echo "  Starting Lumen AI Backend..."
echo "========================================"
echo ""
echo "FastAPI service starting..."
echo ""
echo "API Address: http://127.0.0.1:8888"
echo "API Docs: http://127.0.0.1:8888/docs"
echo ""
echo "Press Ctrl+C to stop service"
echo ""

.venv/bin/python -m uvicorn api.main:app --host 127.0.0.1 --port 8888

# ========================================
# Handle exit
# ========================================
if [ $? -ne 0 ]; then
    echo ""
    echo "========================================"
    echo "  Program Exited with Error"
    echo "========================================"
    echo ""
fi
