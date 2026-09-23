@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================================
echo   Local /crm access check
echo ==========================================================
echo.
echo   /crm is gated by an allowlist of staff email addresses.
echo   The gate FAILS CLOSED - an unset list admits nobody,
echo   including you. That is deliberate.
echo.
echo   The variable that holds the list is not a database key,
echo   so scripts/merge-env.mjs has never copied it down from
echo   Vercel. Production has it; this machine may not.
echo.

if not exist ".env.local" (
  echo   .env.local does not exist. Run fc-db.bat first.
  echo.
  pause
  exit /b 1
)

findstr /b /c:"CRM_STAFF_EMAILS=" ".env.local" >nul 2>&1
if not errorlevel 1 goto already

findstr /b /c:"PARTICIPANT_ADMIN_EMAILS=" ".env.local" >nul 2>&1
if not errorlevel 1 goto fallback

echo   Neither list is set locally. Adding CRM_STAFF_EMAILS.
echo.>> ".env.local"
echo CRM_STAFF_EMAILS=luis@fundedcapital.com>> ".env.local"
echo   ADDED:  CRM_STAFF_EMAILS=luis@fundedcapital.com
goto restart

:already
echo   CRM_STAFF_EMAILS is already set. No change made.
echo   If /crm still 404s, the address in it does not match
echo   the Clerk DEV account you are signed in as.
goto done

:fallback
echo   PARTICIPANT_ADMIN_EMAILS is set and /crm falls back to
echo   it, so no change made. If /crm still 404s, your address
echo   is not in that list - add CRM_STAFF_EMAILS by hand.
goto done

:restart
echo.
echo   ----------------------------------------------------
echo   RESTART THE DEV SERVER. Next reads .env.local once at
echo   startup; the running server still has the old values.
echo   ----------------------------------------------------

:done
echo.
echo   Nothing was printed from .env.local except the line
echo   above, which is only an email address.
echo.
pause
