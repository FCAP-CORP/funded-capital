@echo off
setlocal
REM ==========================================================
REM  Funded Capital - set up the Lending OS database
REM
REM  Double-click this after the Neon database is created in
REM  Vercel. It installs the packages, copies ONLY the database
REM  credentials into .env.local, and creates the tables.
REM
REM  Your existing .env.local is never overwritten - the Clerk
REM  dev keys and anything else already in it are preserved.
REM
REM  Safe to run again if something fails partway.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo  1. INSTALLING PACKAGES
echo     (a few minutes the first time)
echo ============================================
call npm install
if errorlevel 1 goto failed

echo.
echo ============================================
echo  2. FETCHING DATABASE CREDENTIALS
echo     Pulling to a temporary file, not over
echo     your existing settings.
echo ============================================
if exist ".env.vercel" del ".env.vercel"
call npx --yes vercel env pull .env.vercel --yes
if errorlevel 1 (
  echo.
  echo   ^>^> Could not fetch the credentials.
  echo   ^>^> If it asked you to log in, log in and run this again.
  goto failed
)

echo.
echo ============================================
echo  3. MERGING JUST THE DATABASE KEYS
echo ============================================
node scripts\merge-env.mjs
if errorlevel 1 goto failed

echo.
echo ============================================
echo  4. CREATING THE TABLES
echo ============================================
REM --force: drizzle-kit push prompts for confirmation under strict mode, and an
REM unanswered prompt is what silently ends the run. The schema is reviewed in git
REM before it ever gets here.
call npx drizzle-kit push --force
if errorlevel 1 goto failed

echo.
echo ============================================
echo  5. VERIFYING
echo ============================================
node scripts\db-status.mjs
if errorlevel 1 goto failed

echo.
echo ============================================
echo   RESULT: DATABASE IS READY
echo   Tell Claude "the database is set up".
echo ============================================
goto done

:failed
if exist ".env.vercel" del ".env.vercel"
echo.
echo ============================================
echo   RESULT: SOMETHING FAILED - see above
echo   Nothing was damaged. Tell Claude what it
echo   said and run this again after the fix.
echo ============================================

:done
echo.
pause
