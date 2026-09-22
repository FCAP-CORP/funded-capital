@echo off
setlocal
REM ==========================================================
REM  Funded Capital - backfill Sheet broker deals (PRODUCTION)
REM
REM  Writes 6 real broker deals into the LIVE database.
REM  Pulls current credentials from Vercel and deletes them
REM  afterwards. Asks you to type a confirmation.
REM  Re-running is safe - rows already in are skipped.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   BACKFILL - PRODUCTION
echo ============================================
echo.

if exist ".env.vercel" del ".env.vercel"
call npx --yes vercel env pull .env.vercel --yes
if errorlevel 1 (
  echo.
  echo   ^>^> Could not fetch from Vercel.
  goto cleanup
)

echo.
call npx tsx scripts\backfill-broker-sheet.ts --production
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   DONE - tell Claude "production backfill ran".
  echo ============================================
) else (
  echo ============================================
  echo   STOPPED - see .fc-check\backfill-broker-sheet.md
  echo ============================================
)

:cleanup
if exist ".env.vercel" (
  del ".env.vercel"
  echo   Temporary credential file removed.
)
echo.
pause
