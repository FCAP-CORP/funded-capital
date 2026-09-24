@echo off
setlocal
cd /d "%~dp0"
REM ==========================================================
REM  Funded Capital - marketing queue (DEV BRANCH)
REM
REM  Shows what has been asked for on /crm/marketing and not
REM  yet delivered.
REM
REM  THIS READS THE DEV BRANCH, which is almost certainly not
REM  where your real requests are. For the live queue use
REM  fc-content-queue-prod.bat. The script prints which one it
REM  is talking to on every run, so you never have to guess.
REM ==========================================================

echo.
call npx tsx scripts\content-queue.ts list
echo.
pause
