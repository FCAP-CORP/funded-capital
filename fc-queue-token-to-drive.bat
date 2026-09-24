@echo off
setlocal
cd /d "%~dp0"
REM ==========================================================
REM  Funded Capital - give the daily blog task its queue token
REM
REM  WHY: the 7am blog task used to read .queue-token from this
REM  PC, so it only worked when the laptop was awake. It now
REM  reads a private copy from your Google Drive instead, which
REM  is always reachable.
REM
REM  WHAT THIS DOES:
REM    1. Makes sure the agent-system GitHub backup can NEVER
REM       upload the token - adds 00-private/ to that folder's
REM       .gitignore, then asks git to confirm it is excluded.
REM    2. Copies .queue-token into
REM       My Drive\Funded Capital - AI Agent System\00-private\
REM       as content-queue-token.txt
REM
REM  The token is never shown on screen. Run this again any time
REM  you make a new token with fc-queue-token.bat.
REM ==========================================================

set "AGENT=%USERPROFILE%\My Drive\Funded Capital - AI Agent System"
set "PRIVATE=%AGENT%\00-private"
set "DEST=%PRIVATE%\content-queue-token.txt"

echo.
echo ==========================================================
echo   Queue token to Google Drive, for the daily blog task
echo ==========================================================
echo.

if not exist ".queue-token" goto notoken
if not exist "%AGENT%\" goto nodrive
where node >nul 2>nul
if errorlevel 1 goto nonode
where git >nul 2>nul
if errorlevel 1 goto nogit

echo   1. Keeping the token out of the GitHub backup...
node -e "const f=require('fs'),p=process.argv[1];let s=f.existsSync(p)?f.readFileSync(p,'utf8'):'';if(!s.split(/\r?\n/).includes('00-private/')){f.writeFileSync(p,s+(s===''||s.endsWith('\n')?'':'\n')+'\n# Private files for scheduled tasks - never commit\n00-private/\n');console.log('     Added 00-private/ to the agent-system .gitignore');}else{console.log('     Already excluded');}" "%AGENT%\.gitignore"
if errorlevel 1 goto failed

git -C "%AGENT%" check-ignore -q "00-private/content-queue-token.txt"
if errorlevel 1 goto notignored
echo      Git confirms it will never be backed up to GitHub.
echo.

echo   2. Copying the token into Google Drive...
if not exist "%PRIVATE%\" mkdir "%PRIVATE%"
if errorlevel 1 goto failed
copy /y ".queue-token" "%DEST%" >nul
if errorlevel 1 goto failed
if not exist "%DEST%" goto failed
echo      Copied. The token itself was not shown.
echo.
echo ==========================================================
echo   DONE. Google Drive will sync it in a minute or two.
echo   The daily blog task can now run with this laptop asleep.
echo.
echo   Only you can see that folder - it is not shared.
echo   If you ever make a new token, run this again.
echo ==========================================================
goto end

:notoken
echo   There is no .queue-token here yet.
echo   Run fc-queue-token.bat first, then run this again.
echo   Nothing was copied.
goto end

:nodrive
echo   Could not find the Funded Capital - AI Agent System folder
echo   in My Drive. Is Google Drive for desktop running?
echo   Nothing was copied.
goto end

:nonode
echo   Node is not installed, so this cannot run. Nothing was copied.
goto end

:nogit
echo   Git is not installed, so this cannot prove the token stays
echo   out of the GitHub backup. Nothing was copied. Tell Claude.
goto end

:notignored
echo.
echo   STOPPED. Git could not confirm that the token would stay
echo   out of the GitHub backup, so it was NOT copied.
echo   Nothing was copied. Tell Claude exactly this message.
goto end

:failed
echo.
echo   Something went wrong - see the message above.
echo   Tell Claude what it said.

:end
echo.
pause
