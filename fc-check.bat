@echo off
setlocal
REM ==========================================================
REM  Funded Capital - repo health check
REM
REM  Double-click this after Claude changes code. It installs
REM  anything missing, typechecks, runs every regression suite,
REM  and builds the site - then writes the result to
REM  .fc-check\report.md so Claude can read it directly.
REM
REM  You do NOT need to copy anything. Just tell Claude
REM  "the check is done" and it will read the report.
REM
REM  Pass  --fast  to skip the production build.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

node scripts\check.mjs %*
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   RESULT: HEALTHY - safe to push
  echo ============================================
) else (
  echo ============================================
  echo   RESULT: PROBLEMS FOUND - do NOT push
  echo   Tell Claude "the check is done".
  echo ============================================
)
echo.
pause
