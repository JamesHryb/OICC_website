@echo off
REM Double-click this file to test the Super Sixes Scorer locally.
REM It starts a local web server in a separate window (needed because the
REM scorer app can't be opened directly as a file — browsers block that for
REM security reasons) and then opens it in your default browser.
REM
REM To stop the server when you're done, just close the "OICC Local Server"
REM window that pops up.

cd /d "%~dp0"
start "OICC Local Server" cmd /c "python -m http.server 8000"
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000/pages/super-sixes-scorer.html"
