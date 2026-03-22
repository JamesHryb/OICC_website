@echo off
cd /d "%~dp0scraper"

echo.
echo ==================================================
echo   PlayCricket scraper
echo ==================================================
python oicc_playcricket.py --multi-season
if %errorlevel% neq 0 (
    echo [!] PlayCricket scraper finished with errors
) else (
    echo [OK] PlayCricket scraper completed successfully
)

echo.
echo ==================================================
echo   Achton Villa scraper
echo ==================================================
python achton_villa_scraper.py
if %errorlevel% neq 0 (
    echo [!] Achton Villa scraper finished with errors
) else (
    echo [OK] Achton Villa scraper completed successfully
)

echo.
echo All scrapers finished.
pause
