@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================================
echo   Fix the blocked push and send the update to GitHub
echo ==========================================================
echo.
echo   GitHub blocked the last push because a TEST file held
echo   made-up message ids shaped like a Twilio account id.
echo   They were never real secrets. Claude replaced them with
echo   obvious placeholders; this folds that fix into the same
echo   commit and pushes it. Nothing else changes.
echo.
echo   Run fc-migrate-prod.bat BEFORE this if you have not yet.
echo.
echo ----------------------------------------------------------
echo   Press any key to continue, or close this window to stop.
echo ----------------------------------------------------------
pause

git add lib/comms/quoEvents.regress.ts
git commit --amend --no-edit
if errorlevel 1 (
  echo.
  echo   AMEND FAILED - nothing pushed. Send me what is above.
  pause
  exit /b 1
)

echo.
echo   Pushing to main. This deploys.
git push origin main
if errorlevel 1 (
  echo.
  echo   PUSH FAILED - send me what is above.
  pause
  exit /b 1
)

echo.
echo ==========================================================
echo   Done. In about two minutes open /crm and press Ctrl K.
echo ==========================================================
pause
