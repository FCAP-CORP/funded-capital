@echo off
setlocal
REM ==========================================================
REM  Funded Capital - point THIS LAPTOP at the Neon dev branch
REM
REM  Run this after creating a development branch in Neon.
REM  It changes only .env.local on this machine. Vercel and the
REM  live site keep using production.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   Point local dev at the Neon DEV branch
echo ============================================

node scripts\set-dev-db.mjs
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   DONE - tell Claude "local is on the dev branch".
  echo ============================================
) else (
  echo ============================================
  echo   NOTHING WAS CHANGED - see the message above.
  echo ============================================
)
echo.
pause
