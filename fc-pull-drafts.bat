@echo off
setlocal
cd /d "%~dp0"
REM ==========================================================
REM  Funded Capital - pull finished blog drafts down
REM
REM  The daily blog task no longer writes onto this PC - if the
REM  laptop was asleep at 7am, there was no post. It now sends
REM  the finished draft to the website instead, and this script
REM  brings those drafts down into content\blog when YOU want.
REM
REM  It never overwrites a file that is already there, it never
REM  shows the token, and it does not publish anything.
REM  Publishing is still publish-blog.bat.
REM ==========================================================

echo.
echo ==========================================================
echo   Pull finished blog drafts from the website
echo ==========================================================
echo.

where node >nul 2>nul
if errorlevel 1 goto nonode

node scripts\pull-drafts.mjs
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" goto ok
if "%RESULT%"=="2" goto partial
echo ==========================================================
echo   STOPPED - read the message above. Nothing was changed.
echo ==========================================================
goto end

:partial
echo ==========================================================
echo   DONE, BUT SOME DRAFTS WERE REFUSED - see the REFUSED
echo   lines above and send them to Claude. Anything marked
echo   WROTE is safe to read and publish.
echo ==========================================================
goto end

:ok
echo ==========================================================
echo   DONE. Anything marked WROTE is now in content\blog.
echo   Read it, then double-click publish-blog.bat to go live.
echo ==========================================================
goto end

:nonode
echo   Node is not installed on this PC, so this cannot run.
echo   Nothing was changed. Tell Claude.

:end
echo.
pause
