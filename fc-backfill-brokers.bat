@echo off
setlocal
REM ==========================================================
REM  Funded Capital - backfill Sheet broker deals (DEV BRANCH)
REM
REM  Brings the 6 broker submissions that only exist in the
REM  Google Sheet into the CRM. Runs against the dev branch.
REM  Re-running is safe - rows already in are skipped.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   BACKFILL - dev branch
echo ============================================
echo.
echo   Showing what would happen first...
echo.
call npx tsx scripts\backfill-broker-sheet.ts --dry-run
echo.
echo   Now writing to the dev branch...
echo.
call npx tsx scripts\backfill-broker-sheet.ts
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   DONE - tell Claude "dev backfill ran".
  echo ============================================
) else (
  echo ============================================
  echo   STOPPED - see .fc-check\backfill-broker-sheet.md
  echo ============================================
)
echo.
pause
