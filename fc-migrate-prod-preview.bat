@echo off
setlocal
REM ==========================================================
REM  Funded Capital - PREVIEW the production migration
REM
REM  Runs every safety check and shows exactly what would be
REM  applied, WITHOUT connecting to production and WITHOUT
REM  changing anything. Safe to run any time.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   PREVIEW ONLY - production is not touched
echo ============================================
echo.

node scripts\apply-migration-prod.mjs --dry-run

echo.
echo ============================================
echo   Preview finished. Nothing was changed.
echo ============================================
echo.
pause
