@echo off
REM ==========================================================
REM  Funded Capital - auto-commit & push new blog articles
REM  Double-click to run, or schedule via Windows Task Scheduler.
REM ==========================================================

cd /d "C:\Users\luisf\Documents\Claude\Projects\Lead Performance Architect\funded-capital"

REM Only stage blog content so unrelated edits don't get swept in
git add content/blog

REM Commit only if there's something new; otherwise skip cleanly
git diff --cached --quiet
if %errorlevel%==0 (
    echo No new blog changes to publish.
    goto end
)

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set stamp=%dt:~0,4%-%dt:~4,2%-%dt:~6,2%

git commit -m "Auto-publish blog articles (%stamp%)"
git push origin main
echo Done. New articles pushed live.

:end
pause
