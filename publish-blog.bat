@echo off
REM ==========================================================
REM  Funded Capital - auto-commit & push new blog articles
REM  Double-click to run, or schedule via Windows Task Scheduler.
REM  (Path updated 2026-08-24 for the new machine.)
REM  (Date stamp fixed 2026-09-04: 'wmic' was removed in Windows 11
REM   and silently produced commit messages like "(--)".)
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

REM ==========================================================
REM  (7 Oct 2026) Blog posts are normally published with the
REM  Publish button in the CRM now. That puts commits on GitHub
REM  that are not on this PC, so catch up first or the push
REM  below is refused.
REM ==========================================================
git --no-pager pull --rebase --autostash origin main
if errorlevel 1 (
    echo.
    echo   ^>^> Could not catch up with GitHub - read the message above.
    echo   ^>^> If it names a file in content/blog, that post was already
    echo   ^>^> published from the CRM. Delete your copy here and run again.
    goto end
)

REM Only stage blog content so unrelated edits don't get swept in
git add content/blog

REM Commit only if there's something new; otherwise skip cleanly
git diff --cached --quiet
if %errorlevel%==0 (
    echo No new blog changes to publish.
    goto end
)

REM Date stamp via PowerShell. The old 'wmic os get localdatetime'
REM command no longer exists on Windows 11.
set stamp=
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set stamp=%%I
if "%stamp%"=="" set stamp=undated

git commit -m "Auto-publish blog articles (%stamp%)"

git push origin main
if errorlevel 1 (
    echo.
    echo   ^>^> PUSH FAILED - the error is printed above.
    echo   ^>^> Nothing reached GitHub, so Vercel has nothing to deploy.
    goto end
)
echo Done. New articles pushed live.

:end
REM Short wait instead of pause, so Task Scheduler runs never hang
timeout /t 5 >nul
