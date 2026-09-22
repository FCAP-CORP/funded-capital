@echo off
setlocal
REM ==========================================================
REM  Funded Capital - apply migration 0001 to the DEV BRANCH
REM
REM  Adds broker_firms, broker_users, and two columns on
REM  applications. Purely additive - nothing is dropped and
REM  no existing row is touched.
REM
REM  It REFUSES to run unless this machine is provably on the
REM  dev branch. Production is never reachable from here.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   Phase 2a schema change - DEV BRANCH ONLY
echo ============================================

node scripts\db-preflight.mjs
if errorlevel 1 (
  echo.
  echo   Stopped. The database was NOT changed.
  echo   Tell Claude what the message above says.
  echo.
  pause
  exit /b 1
)

echo   Applying migration 0001...
echo.

node scripts\apply-migration.mjs
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo   Re-checking what is actually in the database...
  echo.
  node scripts\db-status.mjs
  echo.
  echo ============================================
  echo   DONE - tell Claude "the migration ran".
  echo ============================================
) else (
  echo ============================================
  echo   MIGRATION HIT A PROBLEM
  echo   Details are in .fc-check\migrate-dev.md
  echo   Tell Claude "the migration failed".
  echo ============================================
)
echo.
pause
