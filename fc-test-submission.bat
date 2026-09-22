@echo off
setlocal
REM ==========================================================
REM  Funded Capital - ONE fake broker submission, dev branch
REM
REM  Writes a single obviously-fake deal through the real code
REM  path and reads back what landed. Does NOT touch Drive, does
REM  NOT email anyone, does NOT go near production.
REM
REM  The test rows use .invalid email addresses that cannot
REM  reach a real person, and carry no phone number at all.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   TEST BROKER SUBMISSION - dev branch only
echo ============================================
echo.

call npx tsx scripts\test-broker-submission.ts
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   ALL CHECKS PASSED
  echo   Tell Claude "the test submission passed".
  echo ============================================
) else (
  echo ============================================
  echo   SOMETHING DID NOT MATCH
  echo   Details are in .fc-check\test-submission.md
  echo   Tell Claude "the test submission failed".
  echo ============================================
)
echo.
pause
