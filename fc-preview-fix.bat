@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================================
echo   Fix the redesign preview (Internal Server Error)
echo ==========================================================
echo.
echo   The preview crashed because Vercel's Preview environment
echo   has no Clerk login keys - they are set for Production only.
echo.
echo   This script:
echo     1. Copies your Clerk DEVELOPMENT keys from .env.local
echo        into Vercel, for the redesign-ledger preview only.
echo        (Live keys only work on fundedcapital.com.)
echo     2. Rebuilds the preview so it picks them up.
echo.
echo   The live site and its keys are not touched. No key is
echo   shown on screen.
echo.
pause

node scripts\preview-env.mjs
if errorlevel 1 goto fail

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%B
if not "%BRANCH%"=="main" (
  echo   You are on branch %BRANCH%, not main. Run: git checkout main
  goto fail
)
set DIRTY=
for /f "delims=" %%L in ('git status --porcelain --untracked-files=no') do set DIRTY=1
if defined DIRTY (
  echo   STOPPED: there are uncommitted changes, so the rebuild was
  echo   not started. The keys ARE saved in Vercel. Commit your
  echo   changes, then run this again.
  git status --short --untracked-files=no
  goto fail
)

git checkout redesign-ledger
if errorlevel 1 goto fail
git commit --allow-empty -m "Rebuild preview with Preview-scoped Clerk keys" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_019FJSPLhnDRPvg6GpGPkMTV"
git push origin redesign-ledger
set PUSHED=%errorlevel%
git checkout main
if not "%PUSHED%"=="0" goto fail

echo.
echo ==========================================================
echo   Done. The preview is rebuilding (about 2 minutes).
echo   Then open:
echo   https://funded-capital-git-redesign-ledger-fcap-f6041836.vercel.app
echo ==========================================================
pause
exit /b 0

:fail
echo.
echo   Stopped. Copy the lines above into the chat.
pause
exit /b 1
