@echo off
setlocal
REM ==========================================================
REM  Funded Capital - migration DRY RUN
REM
REM  Reads the CRM workbook and the BiggerPockets export and
REM  reports exactly what WOULD be loaded. Writes nothing to
REM  the database.
REM
REM  Result goes to .fc-check\migration-dryrun.md so Claude can
REM  read it even if this window closes.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo  MIGRATION DRY RUN - no data is written
echo ============================================
echo.

call npx tsx scripts\migrate-crm.ts
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   DRY RUN COMPLETE - nothing was changed
  echo   Tell Claude "the dry run is done".
  echo ============================================
) else (
  echo ============================================
  echo   DRY RUN HIT A PROBLEM - see above
  echo   Nothing was changed.
  echo ============================================
)
echo.
pause
