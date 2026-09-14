@echo off
setlocal
REM ==========================================================
REM  Funded Capital - migration FOR REAL
REM
REM  Loads the CRM workbook and the BiggerPockets export into
REM  the database, then verifies every count against the
REM  sources.
REM
REM  Run fc-migrate.bat FIRST and review the dry run.
REM
REM  This refuses to run if the database already has contacts
REM  in it, so it cannot double-load by accident.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo  MIGRATING FOR REAL
echo  Run fc-migrate.bat first if you have not.
echo ============================================
echo.

call npx tsx scripts\migrate-crm.ts --commit
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   MIGRATION COMPLETE AND VERIFIED
  echo   Tell Claude "the migration is done".
  echo ============================================
) else (
  echo ============================================
  echo   MIGRATION DID NOT VERIFY - see above
  echo   Tell Claude what it said before doing
  echo   anything else.
  echo ============================================
)
echo.
pause
