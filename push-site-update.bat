@echo off
REM ==========================================================
REM  Funded Capital - commit & push EVERYTHING (site updates)
REM  Use this when Claude has updated code (app/, lib/, etc.),
REM  not just blog posts. Double-click to run.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

git add -A

git diff --cached --quiet
if %errorlevel%==0 (
    echo Nothing to publish - working tree is clean.
    goto end
)

REM Date stamp via PowerShell. The old 'wmic' command was removed in
REM Windows 11, which silently produced commit messages like "Site update (--)".
set stamp=
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set stamp=%%I
if "%stamp%"=="" set stamp=undated

git commit -m "Site update (%stamp%)"
git push origin main
if errorlevel 1 (
    echo.
    echo   ^>^> PUSH FAILED - the error is printed above.
    echo   ^>^> Nothing reached GitHub, so Vercel has nothing to deploy.
    goto end
)
echo Done. Update pushed - Vercel is deploying now.

:end
pause
