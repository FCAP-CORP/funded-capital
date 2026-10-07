@echo off
REM ==========================================================
REM  Funded Capital - commit & push EVERYTHING (site updates)
REM  Use this when Claude has updated code (app/, lib/, etc.),
REM  not just blog posts. Double-click to run.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

REM (7 Oct 2026) The CRM's Publish button commits blog posts
REM straight to GitHub, so catch up before pushing.
git --no-pager pull --rebase --autostash origin main
if errorlevel 1 (
    echo.
    echo   ^>^> Could not catch up with GitHub - read the message above.
    echo   ^>^> If it names a file in content/blog, that post was already
    echo   ^>^> published from the CRM. Delete your copy here and run again.
    goto end
)

git add -A

git diff --cached --quiet
if %errorlevel%==0 (
    echo No new edits to commit - checking whether GitHub is behind.
    goto push
)

REM Date stamp via PowerShell. The old 'wmic' command was removed in
REM Windows 11, which silently produced commit messages like "Site update (--)".
set stamp=
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set stamp=%%I
if "%stamp%"=="" set stamp=undated

git commit -m "Site update (%stamp%)"

:push
REM ==========================================================
REM  ALWAYS try the push, even when there was nothing new to
REM  commit. A commit can sit on this machine having never
REM  reached GitHub - a dropped connection or a GitHub 500
REM  leaves exactly that state. The old version of this script
REM  jumped straight to the end whenever the working tree was
REM  clean, so it would say "Nothing to publish" while a
REM  finished commit sat unpushed and Vercel deployed nothing.
REM  If everything really is up to date, git says so and stops.
REM ==========================================================
echo.
echo Pushing to GitHub...
git push origin main
if errorlevel 1 (
    echo.
    echo   ^>^> PUSH FAILED - the error is printed above.
    echo   ^>^> Nothing reached GitHub, so Vercel has nothing to deploy.
    echo   ^>^> "Internal Server Error" is GitHub's own fault and is
    echo   ^>^> usually temporary - just run this file again.
    goto end
)
echo.
echo Done. Anything new is pushed - Vercel is deploying now.

:end
pause
