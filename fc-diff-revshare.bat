@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================================
echo   Revenue share: what is committed vs what is on disk
echo ==========================================================
echo.
echo   This CHANGES NOTHING. It only looks and writes a
echo   report to revshare-diff.txt, which I will read.
echo.
pause

set OUT=revshare-diff.txt

echo ===== generated %DATE% %TIME% =====> %OUT%
echo.>> %OUT%

echo ===== LAST 8 COMMITS TOUCHING THESE FILES =====>> %OUT%
git log --date=iso -8 --pretty=format:"%%h %%ad %%s" -- lib/revenueShare.server.ts lib/revenueShare.ts app/participant-portal/admin/AdminActions.tsx >> %OUT% 2>&1
echo.>> %OUT%
echo.>> %OUT%

echo ===== CURRENT HEAD =====>> %OUT%
git log --date=iso -1 --pretty=format:"%%h %%ad %%s" >> %OUT% 2>&1
echo.>> %OUT%
echo.>> %OUT%

echo ===== SIZE OF THE DIFFERENCE =====>> %OUT%
git diff --stat -- lib/revenueShare.server.ts lib/revenueShare.ts app/participant-portal/admin/AdminActions.tsx >> %OUT% 2>&1
echo.>> %OUT%
echo.>> %OUT%

echo ===== THE FULL DIFFERENCE =====>> %OUT%
echo (minus lines = what is committed now, plus lines = what is on your disk)>> %OUT%
echo.>> %OUT%
git diff -- lib/revenueShare.server.ts lib/revenueShare.ts app/participant-portal/admin/AdminActions.tsx >> %OUT% 2>&1

echo.
echo   Written to revshare-diff.txt
echo   Tell me it is done and I will read it.
echo.
pause
