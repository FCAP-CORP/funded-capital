@echo off
setlocal
REM ==========================================================
REM  Funded Capital - run the site LOCALLY for a look
REM
REM  Starts the dev server on http://localhost:3000 using your
REM  .env.local, which points at the Neon DEV branch. Nothing
REM  here touches the live site or production data.
REM
REM  Leave this window OPEN while looking at the site.
REM  Press Ctrl+C (then Y) in this window to stop it.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   LOCAL DEV SERVER - dev branch
echo ============================================
echo.
echo   Once it says "Ready", open:
echo     http://localhost:3000/broker-portal/apply
echo.
echo   Leave this window open. Ctrl+C to stop.
echo.

call npm run dev

echo.
echo   Dev server stopped.
pause
