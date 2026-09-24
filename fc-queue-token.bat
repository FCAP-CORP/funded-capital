@echo off
setlocal
cd /d "%~dp0"
REM ==========================================================
REM  Funded Capital - marketing queue API token
REM
REM  WHY THIS SCRIPT CHANGED
REM  The first version tried to push the token to Vercel from
REM  the command line. That step hangs forever: the Vercel CLI
REM  stops to ask a question, and a double-clicked script has
REM  nobody to answer it. My mistake.
REM
REM  This version does not touch the Vercel CLI. It makes the
REM  token, keeps it out of git, and then opens the two windows
REM  you need so you can paste it into Vercel yourself.
REM  About 30 seconds of clicking.
REM
REM  The token is never shown in chat and never leaves this PC
REM  except to Vercel, where it belongs.
REM ==========================================================

echo.
echo ==========================================================
echo   Marketing queue token
echo ==========================================================
echo.

if exist ".queue-token" goto haveit

echo   Generating a 48-character token...
node -e "const c=require('crypto'),f=require('fs');f.writeFileSync('.queue-token',c.randomBytes(36).toString('base64url'));console.log('  Written to .queue-token ('+f.readFileSync('.queue-token','utf8').length+' characters)')"
if errorlevel 1 (
  echo.
  echo   ^>^> Could not generate the token. Is Node installed?
  goto end
)
goto gitignore

:haveit
echo   You already have a token in .queue-token - keeping it.
echo   ^(To rotate later: delete that file and run this again.^)

:gitignore
findstr /x /c:".queue-token" .gitignore >nul 2>&1
if errorlevel 1 (
  echo.>> .gitignore
  echo .queue-token>> .gitignore
  echo   Added .queue-token to .gitignore
) else (
  echo   .gitignore already keeps it out of git
)

echo.
echo ----------------------------------------------------------
echo   NOW THE PART I CANNOT DO FOR YOU
echo ----------------------------------------------------------
echo.
echo   Two windows are about to open: Notepad with the token,
echo   and your Vercel dashboard.
echo.
echo   1. In Notepad: Ctrl+A then Ctrl+C to copy the token.
echo   2. Vercel opens straight on the right page.
echo   3. Click "Add Another" / "Create new".
echo   4. Key:    CONTENT_QUEUE_TOKEN
echo      Value:  paste it (Ctrl+V)
echo   5. Tick Production, Preview AND Development.
echo   6. Save.
echo.
echo   Then close Notepad WITHOUT saving any changes.
echo.
pause

start "" notepad .queue-token
start "" https://vercel.com/fcap-f6041836/funded-capital/settings/environment-variables

echo.
echo ==========================================================
echo   Last step, once it is saved in Vercel:
echo.
echo   Run fc-commit-queue-api.bat
echo.
echo   Vercel only picks up a new variable on the next build,
echo   so the token is not live until that deploy finishes.
echo ==========================================================

:end
echo.
pause
