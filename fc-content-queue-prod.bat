@echo off
setlocal
cd /d "%~dp0"
REM ==========================================================
REM  Funded Capital - marketing queue (PRODUCTION)
REM
REM  The REAL queue: what you asked for on the live site.
REM
REM  It pulls current credentials from Vercel into a scratch
REM  file and deletes that file when it finishes. Your
REM  .env.local is never touched, so this machine stays on the
REM  dev branch afterwards.
REM
REM  READ ONLY. This lists requests. It changes nothing.
REM ==========================================================

echo.
echo   Fetching current production credentials from Vercel...
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
call npx tsx scripts\content-queue.ts list --env .env.vercel

:cleanup
REM The scratch file holds production secrets. It does not linger.
if exist ".env.vercel" (
  del ".env.vercel"
  echo.
  echo   Temporary credential file removed.
)
echo.
pause
