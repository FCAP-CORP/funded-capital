@echo off
REM ==========================================================
REM  Funded Capital - check the participant web app is serving
REM  the Paid Off fields. Double-click, read the bottom line.
REM  Reads nothing out loud: the shared secret is never printed.
REM ==========================================================
cd /d "C:\Users\luis\repos\funded-capital"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\paid-off-check.ps1"
echo.
pause
