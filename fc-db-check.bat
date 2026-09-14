@echo off
setlocal
REM ==========================================================
REM  Funded Capital - check what is in the database
REM
REM  Double-click. It connects, lists the tables, and writes
REM  .fc-check\db-status.md so Claude can read the result even
REM  if this window closes.
REM
REM  Reads nothing you have to copy. No credentials are shown.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo  CHECKING THE DATABASE
echo ============================================
echo.

node scripts\db-status.mjs
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   RESULT: DATABASE IS READY
  echo ============================================
) else (
  echo ============================================
  echo   RESULT: NOT READY - details in the report
  echo ============================================
)
echo.
echo   Tell Claude "the db check is done".
echo.
pause
