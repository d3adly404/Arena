@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   AIAgent - run from source (no build)
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python was not found on PATH.
    echo         Install Python 3.10+ from https://python.org and tick
    echo         "Add python.exe to PATH".
    pause
    exit /b 1
)
python --version
echo.

if not exist ".venv\Scripts\python.exe" (
    echo Creating a virtual environment in .venv ...
    python -m venv .venv
    if errorlevel 1 ( echo [ERROR] venv failed & pause & exit /b 1 )
)
set "PY=.venv\Scripts\python.exe"

echo Installing dependencies (first time only, can take a few minutes) ...
"%PY%" -m pip install --upgrade pip >nul
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 ( echo [ERROR] dependency install failed. & pause & exit /b 1 )

echo.
echo Starting AIAgent. Close the window (or press Ctrl+C) to stop.
echo.
"%PY%" -m ai_agent
endlocal
pause
