@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================================
echo   Broker admission - end to end test
echo ==========================================================
echo.
echo   Runs the REAL gate against your DEV BRANCH database.
echo   It REFUSES to run against production.
echo.
echo   Why not just click around: staff bypass the gate by
echo   design, and your account already has a broker row from
echo   earlier testing, so you would be waved through either
echo   way. This covers the paths you cannot reach by hand -
echo   a forwarded invitation, a revoked one, and the
echo   grandfather case.
echo.
echo   Every address it creates ends in .invalid and is
echo   deleted before it exits.
echo.
echo   Starting...
echo.

REM  `call` is REQUIRED here. npx on Windows is npx.cmd - a batch
REM  file - and one .bat invoking another WITHOUT `call` hands over
REM  control and never comes back, so everything below this line is
REM  skipped and the window shuts the moment npx finishes. That is
REM  exactly what happened on 23 Sep 2026: the test ran, printed its
REM  error, and vanished before anyone could read it.
REM  fc-check.bat does not need this because `node` is an .exe.
call npx tsx --conditions=react-server scripts/test-invites.ts
set RESULT=%errorlevel%

echo.
if "%RESULT%"=="0" (
  echo ============================================
  echo   RESULT: all green
  echo ============================================
) else (
  echo ============================================
  echo   RESULT: SOMETHING FAILED - do not push
  echo   Scroll up for the failing line.
  echo ============================================
)
echo.
pause
