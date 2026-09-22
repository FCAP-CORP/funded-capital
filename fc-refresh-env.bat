@echo off
setlocal
REM ==========================================================
REM  Funded Capital - refresh the local database credentials
REM
REM  Run this AFTER rotating the Neon secrets in Vercel.
REM  Rotation changes the database password, which makes the
REM  copy in your .env.local stale - every local database
REM  script will fail until this is run.
REM
REM  Your Clerk dev keys and everything else in .env.local are
REM  preserved. Only the database keys are replaced.
REM
REM  IF THIS MACHINE IS ON A NEON DEV BRANCH it will REFUSE and
REM  change nothing - replacing would move local development
REM  back onto production. Use fc-use-dev-db.bat instead to
REM  re-copy the dev branch credentials from Neon.
REM
REM  It does NOT touch the schema and does NOT deploy.
REM  Safe to run again at any time.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo.
echo  ============================================================
echo    REFRESHING DATABASE CREDENTIALS
echo  ============================================================
echo.
echo    Pulling to a temporary file - never over your settings.
echo.

if exist ".env.vercel" del ".env.vercel"

call npx --yes vercel env pull .env.vercel --yes
if errorlevel 1 (
  echo.
  echo    ^>^> Could not fetch from Vercel.
  echo    ^>^> If it asked you to log in, log in and run this again.
  goto cleanup
)

echo.
echo  ============================================================
echo    REPLACING THE DATABASE KEYS
echo  ============================================================
REM --replace is the whole point of this script. Without it the merge
REM only ADDS missing keys and leaves a stale password in place, which
REM is what silently broke the first production migration on 22 Sep 2026.
node scripts\merge-env.mjs --replace
if errorlevel 1 (
  echo.
  echo    ^>^> Nothing was changed. See the message above.
  goto cleanup
)

:verify
echo.
echo  ============================================================
echo    TESTING THE NEW CREDENTIALS
echo  ============================================================
node scripts\db-status.mjs
if errorlevel 1 (
  echo.
  echo    ^>^> Could not connect with the new credentials.
  echo    ^>^> Check the rotation finished in Vercel, then run this again.
  goto cleanup
)

echo.
echo  ============================================================
echo    DONE - local credentials refreshed
echo  ============================================================
echo.
echo    Reminder: the LIVE SITE needs a redeploy to pick up the
echo    new password. Vercel ^> Deployments ^> newest ^> Redeploy.
echo    Until then /crm will not load.
echo.

:cleanup
REM The scratch file holds live credentials. It never survives this script.
if exist ".env.vercel" del ".env.vercel"
echo.
pause
