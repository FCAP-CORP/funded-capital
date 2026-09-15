@echo off
setlocal enabledelayedexpansion
REM ==========================================================
REM  Diagnose the participant portal data failure.
REM  Pulls PRODUCTION env from Vercel, tests the real Apps
REM  Script call, prints the result, then deletes the pulled
REM  file. The secret is never printed.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"
set "OUT=.fc-check\participant-diag.txt"
if not exist ".fc-check" mkdir ".fc-check"

echo ============================================ > "%OUT%"
echo  PARTICIPANT PORTAL DIAGNOSTIC >> "%OUT%"
echo ============================================ >> "%OUT%"
echo. >> "%OUT%"

echo Pulling PRODUCTION environment from Vercel...
call vercel env pull .env.production.local --environment=production --yes >nul 2>&1
if not exist ".env.production.local" (
  echo RESULT: could not pull production env ^(vercel CLI not logged in?^) >> "%OUT%"
  goto show
)

set "PURL="
set "PSEC="
for /f "usebackq tokens=1,* delims==" %%A in (".env.production.local") do (
  if "%%A"=="PARTICIPANT_WEBAPP_URL" set "PURL=%%~B"
  if "%%A"=="PARTICIPANT_WEBAPP_SECRET" set "PSEC=%%~B"
)

if not defined PURL (
  echo PARTICIPANT_WEBAPP_URL    : NOT SET in production >> "%OUT%"
) else (
  echo PARTICIPANT_WEBAPP_URL    : !PURL! >> "%OUT%"
  call :strlen LEN "!PURL!"
  echo   url length              : !LEN! >> "%OUT%"
)
if not defined PSEC (
  echo PARTICIPANT_WEBAPP_SECRET : NOT SET in production >> "%OUT%"
) else (
  call :strlen SLEN "!PSEC!"
  echo PARTICIPANT_WEBAPP_SECRET : set, length !SLEN! ^(value not shown^) >> "%OUT%"
)
echo. >> "%OUT%"

if defined PURL if defined PSEC (
  echo Calling the endpoint exactly as the site does... >> "%OUT%"
  curl -s -L -m 60 -o ".fc-check\resp.txt" -w "  http_status=%%{http_code}  time=%%{time_total}s" "!PURL!?secret=!PSEC!&action=book" >> "%OUT%" 2>>"%OUT%"
  echo. >> "%OUT%"
  echo. >> "%OUT%"
  echo   --- first 300 characters of the response --- >> "%OUT%"
  powershell -NoProfile -Command "$c=Get-Content -Raw -ErrorAction SilentlyContinue .fc-check\resp.txt; if($c){$c.Substring(0,[Math]::Min(300,$c.Length))}else{(empty response)}" >> "%OUT%"
  echo. >> "%OUT%"
  powershell -NoProfile -Command "$c=Get-Content -Raw -ErrorAction SilentlyContinue .fc-check\resp.txt; Write-Output (  total length:  + $(if($c){$c.Length}else{0}))" >> "%OUT%"
)

del /q ".env.production.local" 2>nul
del /q ".fc-check\resp.txt" 2>nul

:show
echo. >> "%OUT%"
echo Pulled env file deleted. >> "%OUT%"
type "%OUT%"
echo.
echo ============================================
echo  Done. Saved to %OUT%
echo ============================================
pause
goto :eof

:strlen
set "s=%~2#"
set "n=0"
:strlen_loop
if not "!s:~%n%,1!"=="" set /a n+=1 & goto strlen_loop
set /a n-=1
set "%~1=%n%"
goto :eof
