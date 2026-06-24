@echo off
echo ==========================================
echo Starting LightRAG Python Service...
echo ==========================================
echo Target URL: http://localhost:8000
echo Ensure python is installed and dependencies are configured.
echo Run: pip install lightrag-hku
echo ==========================================
python -c "import lightrag" 2>NUL
if %errorlevel% neq 0 (
    echo [ERROR] lightrag library is not installed in current Python env.
    echo Please run: pip install lightrag-hku
    pause
    exit /b 1
)

python -m lightrag.api.server --port 8000
pause
