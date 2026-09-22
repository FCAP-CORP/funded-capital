@echo off
setlocal
REM ==========================================================
REM  Funded Capital - apply migrations to PRODUCTION
REM
REM  THIS CHANGES THE LIVE DATABASE - the one holding the real
REM  borrower records.
REM
REM  It pulls CURRENT credentials from Vercel first, into a
REM  scratch file that is deleted when this finishes. Your
REM  .env.local is never touched, so this machine stays on the
REM  dev branch afterwards.
REM
REM  It will refuse unless every check passes, show you the row
REM  counts, and ask you to type a confirmation. Closing this
REM  window cancels it.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   PRODUCTION MIGRATION
echo ============================================
echo.
echo   Fetching CURRENT production credentials from Vercel...
echo   (a saved copy can be stale after a password rotation)
echo.

if exist ".env.vercel" del ".env.vercel"

call npx --yes vercel env pull .env.vercel --yes
if errorlevel 1 (
  echo.
  echo   ^>^> Could not fetch from Vercel.
  echo   ^>^> If it asked you to log in, log in and run this again.
  goto cleanup
)

echo.
echo   This changes the LIVE database.
echo   You will be asked to type a confirmation.
echo.

node scripts\apply-migration-prod.mjs
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   DONE - production is up to date.
  echo   Tell Claude "production migration ran".
  echo ============================================
) else (
  echo ============================================
  echo   STOPPED - see the message above.
  echo   Details in .fc-check\migrate-prod.md
  echo   Tell Claude what it said.
  echo ============================================
)

:cleanup
REM The scratch file holds production secrets. It does not linger.
if exist ".env.vercel" (
  del ".env.vercel"
  echo.
  echo   Temporary credential file removed.
)
echo.
pause
