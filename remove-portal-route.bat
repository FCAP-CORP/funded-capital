@echo off
REM ==========================================================
REM  Funded Capital - remove the retired /portal router
REM
REM  /portal decided which portal to send someone to by looking
REM  them up in the participant sheet. It has been replaced by
REM  two plain doors: /participant-portal and /broker-portal.
REM  Git keeps the history, so this is reversible.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

if exist "app\portal\page.tsx" (
  del /q "app\portal\page.tsx"
  rmdir "app\portal" 2>nul
  echo   Removed app\portal
) else (
  echo   app\portal already gone - nothing to do
)
echo.
pause
