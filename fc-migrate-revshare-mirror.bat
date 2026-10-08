@echo off
setlocal
REM ==========================================================
REM  Funded Capital - create the Revenue Share mirror tables
REM
REM  Applies ONE migration to the live database:
REM    drizzle\0020_revenue_share_mirror.sql
REM
REM  It creates five new, empty tables (rs_participations,
REM  rs_schedule, rs_payments, rs_sync_runs, rs_rollovers) and
REM  touches nothing that already exists. Every statement is
REM  "IF NOT EXISTS", so running this twice is harmless.
REM
REM  Nothing in the portal reads these tables yet, so this
REM  changes nothing you can see. It is the groundwork for the
REM  read mirror that makes the Program Book load instantly.
REM
REM  FC_MIGRATE_ONLY names the single file to apply, so another
REM  session's unfinished migration cannot ride along.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   REVENUE SHARE MIRROR - PRODUCTION
echo ============================================
echo.
echo   Applying only: 0020_revenue_share_mirror.sql
echo   Creates 5 empty tables. Changes no existing data.
echo.
pause

set FC_MIGRATE_ONLY=0020_revenue_share_mirror.sql
call fc-migrate-prod.bat
set RESULT=%errorlevel%
set FC_MIGRATE_ONLY=

echo.
if "%RESULT%"=="0" (
  echo   The mirror tables exist. Tell Claude "mirror tables created".
) else (
  echo   It stopped - see the message above and tell Claude what it said.
)
echo.
pause
endlocal & exit /b %RESULT%
