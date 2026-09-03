@echo off
REM ==========================================================
REM  Funded Capital - one-time install of the BotID package
REM
REM  Adds Vercel BotID to the project so the lead form can
REM  verify that submissions come from a real browser.
REM  Updates package.json AND package-lock.json together,
REM  which is why this has to run before the next push.
REM
REM  Double-click to run. Safe to run twice.
REM  Delete this file once it has succeeded.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo.
echo Installing the botid package. This takes 10-30 seconds...
echo.

call npm install botid

if errorlevel 1 (
    echo.
    echo   ^>^> INSTALL FAILED - the error is printed above.
    echo   ^>^> Do NOT push yet. Send Luis's assistant the message above.
    echo.
    goto end
)

echo.
echo   Done. botid is installed.
echo.
echo   NEXT STEP: double-click push-site-update.bat to deploy.
echo.

:end
pause
