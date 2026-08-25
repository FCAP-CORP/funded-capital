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

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set stamp=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%

git commit -m "Site update (%stamp%)"
git push origin main
echo Done. Update pushed - Vercel is deploying now.

:end
pause
