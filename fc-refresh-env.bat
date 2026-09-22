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
echo    MERGING ONLY THE DATABASE KEYS
echo  ============================================================
node scripts\merge-env.mjs
if errorlevel 1 (
  echo.
  echo    ^>^> The merge failed. Your .env.local was NOT changed.
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
