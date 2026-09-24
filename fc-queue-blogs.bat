@echo off
setlocal
cd /d "%~dp0"
REM ==========================================================
REM  Funded Capital - queue the blog backlog (PRODUCTION)
REM
REM  Reads content\blog-queue-2026-09.txt and adds every row
REM  to the marketing queue on the LIVE site.
REM
REM  It shows you the full list FIRST and changes nothing
REM  until you press a key. Close the window to cancel.
REM
REM  Edit or delete lines in that text file before running
REM  this if you want a different thirty.
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
echo ==========================================================
echo   DRY RUN - nothing is being written yet
echo ==========================================================
call npx tsx scripts\content-queue.ts queue --file content\blog-queue-2026-09.txt --env .env.vercel --dry-run
if errorlevel 1 (
  echo.
  echo   ^>^> The list did not validate. Nothing was written.
  echo   ^>^> Fix the lines named above and run this again.
  goto cleanup
)

echo.
echo   Everything above will be added to the live queue.
echo   The scheduled task takes ONE per run, three times a
echo   weekday - so about two weeks of posts.
echo.
echo   Press a key to queue them, or close this window.
pause

call npx tsx scripts\content-queue.ts queue --file content\blog-queue-2026-09.txt --env .env.vercel --by luis

:cleanup
REM The scratch file holds production secrets. It does not linger.
if exist ".env.vercel" (
  del ".env.vercel"
  echo.
  echo   Temporary credential file removed.
)
echo.
pause
