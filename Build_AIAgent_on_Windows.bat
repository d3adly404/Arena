@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   AIAgent - Windows build
echo   (see + hear + talk assistant)
echo ============================================
echo.

REM --- Locate Python ---------------------------------------------------------
where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python was not found on PATH.
    echo         Install Python 3.10 or newer from https://python.org and
    echo         tick "Add python.exe to PATH" during setup.
    echo.
    pause
    exit /b 1
)
python --version
echo.

REM --- Virtual environment ---------------------------------------------------
if not exist ".venv\Scripts\python.exe" (
    echo Creating a virtual environment in .venv ...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Could not create the virtual environment.
        pause
        exit /b 1
    )
)
set "PY=.venv\Scripts\python.exe"

echo Upgrading pip ...
"%PY%" -m pip install --upgrade pip >nul

echo Installing dependencies (this can take a few minutes) ...
"%PY%" -m pip install -r requirements.txt
if errorlevel 1 ( echo [ERROR] dependency install failed. & pause & exit /b 1 )
"%PY%" -m pip install -r requirements-build.txt
if errorlevel 1 ( echo [ERROR] build dependency install failed. & pause & exit /b 1 )

echo.
echo Building AIAgent.exe with PyInstaller ...
"%PY%" -m PyInstaller ai_agent.spec --noconfirm --clean
if errorlevel 1 ( echo [ERROR] PyInstaller build failed. & pause & exit /b 1 )

echo.
if exist "dist\AIAgent.exe" (
    echo ============================================
    echo   BUILD SUCCEEDED
    echo.
    echo   Executable : %cd%\dist\AIAgent.exe
    echo.
    echo   To use it:
    echo     1. Copy AIAgent.exe to any folder (e.g. your Desktop).
    echo     2. Double-click it. A live window opens and it says hello.
    echo     3. For the best (cloud) brain, put your Gemini API key in
    echo        config.json next to the exe, or set the environment
    echo        variable GEMINI_API_KEY. Without a key it uses a local
    echo        Ollama vision model instead (see README.md).
    echo ============================================
) else (
    echo [ERROR] AIAgent.exe was not produced - see the log above.
)
endlocal
pause
