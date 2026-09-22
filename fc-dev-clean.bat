@echo off
setlocal
REM ==========================================================
REM  Funded Capital - LOCAL dev server, cleared cache
REM
REM  Same as fc-dev.bat but deletes the .next build cache
REM  first. Use this when a NEW page or API route returns 404
REM  locally even though the file is on disk - that is a stale
REM  route manifest, not a missing file.
REM
REM  STOP the other dev window first (Ctrl+C, then Y).
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   LOCAL DEV - clearing .next cache first
echo ============================================
echo.

if exist ".next" (
  echo   Removing .next ...
  rmdir /s /q ".next"
  echo   Done.
) else (
  echo   No .next cache to remove.
)

echo.
echo   Starting. First compile takes longer than usual.
echo.
echo   Then open:
echo     http://localhost:3000/broker-portal/apply
echo.
echo   Leave this window open. Ctrl+C to stop.
echo.

call npm run dev

echo.
echo   Dev server stopped.
pause
