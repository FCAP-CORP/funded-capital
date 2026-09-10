@echo off
REM ==========================================================
REM  Funded Capital - verify the site compiles BEFORE pushing
REM  Double-click this, wait for it to finish, and read the
REM  result at the bottom. Nothing is committed or pushed.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo  BUILDING - this takes about a minute
echo ============================================
echo.

call npm run build

echo.
if errorlevel 1 (
  echo ============================================
  echo   RESULT: BUILD FAILED
  echo   Do NOT push. The error is printed above.
  echo ============================================
) else (
  echo ============================================
  echo   RESULT: BUILD OK - safe to push
  echo ============================================
)
echo.
pause
