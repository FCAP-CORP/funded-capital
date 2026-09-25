@echo off
setlocal
cd /d "%~dp0"
REM ==========================================================
REM  Funded Capital - daily blog cron: the two Vercel settings
REM
REM  The 7am blog now runs inside the website (a Vercel cron),
REM  not as a Claude scheduled task. It needs two values in
REM  Vercel that nobody else ever sees:
REM
REM    CRON_SECRET        - proves a request came from Vercel's
REM                         scheduler. This script makes it.
REM    ANTHROPIC_API_KEY  - lets the site ask Claude to write.
REM                         You create it at console.anthropic.com.
REM
REM  CONTENT_QUEUE_TOKEN is already in Vercel. Nothing to do.
REM ==========================================================

echo.
echo ==========================================================
echo   Daily blog cron - Vercel settings
echo ==========================================================
echo.

if exist ".cron-secret" goto haveit
echo   Generating a 48-character CRON_SECRET...
node -e "const c=require('crypto'),f=require('fs');f.writeFileSync('.cron-secret',c.randomBytes(36).toString('base64url'));console.log('  Written to .cron-secret ('+f.readFileSync('.cron-secret','utf8').length+' characters)')"
if errorlevel 1 (
  echo   ^>^> Could not generate it. Is Node installed?
  goto end
)
goto gitignore

:haveit
echo   You already have one in .cron-secret - keeping it.

:gitignore
findstr /x /c:".cron-secret" .gitignore >nul 2>&1
if errorlevel 1 (
  echo.>> .gitignore
  echo .cron-secret>> .gitignore
  echo   Added .cron-secret to .gitignore
) else (
  echo   .gitignore already keeps it out of git
)

echo.
echo ----------------------------------------------------------
echo   THREE WINDOWS WILL OPEN: Notepad, Vercel, Anthropic.
echo ----------------------------------------------------------
echo.
echo   A. CRON_SECRET
echo      1. In Notepad: Ctrl+A, Ctrl+C.
echo      2. In Vercel: Add Environment Variable.
echo         Key:   CRON_SECRET
echo         Value: paste.  Environment: Production.  Save.
echo      3. Close Notepad WITHOUT saving.
echo.
echo   B. ANTHROPIC_API_KEY
echo      1. In the Anthropic console: Create Key, name it
echo         "fundedcapital-daily-blog", copy it.
echo      2. In Vercel: Add Environment Variable.
echo         Key:   ANTHROPIC_API_KEY
echo         Value: paste.  Environment: Production.
echo         Tick "Sensitive".  Save.
echo      3. Optional: in the console, set a monthly spend limit.
echo         One post a day costs well under a dollar.
echo.
echo   Never paste either value into a chat.
echo.
pause

start "" notepad .cron-secret
start "" https://vercel.com/fcap-f6041836/funded-capital/settings/environment-variables
start "" https://console.anthropic.com/settings/keys

echo.
echo ==========================================================
echo   When both are saved in Vercel, the next steps are:
echo     1. fc-migrate-prod.bat   (adds one column)
echo     2. fc-commit-daily-blog-cron.bat   (deploys)
echo ==========================================================

:end
echo.
pause
