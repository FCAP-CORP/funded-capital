@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================================
echo   Put the durable tooling in git, keep the one-shots out
echo ==========================================================
echo.
echo   Most of your scripts are ALREADY tracked - fc-check,
echo   fc-db, fc-dev, fc-migrate-*, fc-secret, fc-backfill-*
echo   and the rest all went in earlier.
echo.
echo   The gap is one file: fc-fix-local-crm.bat. It is
echo   reusable - any new machine, or any time .env.local is
echo   rebuilt, needs it.
echo.
echo   The fc-commit-phase2*.bat scripts are NOT going in.
echo   Each exists to make one commit, has already run, and
echo   will never run again. They are now gitignored so they
echo   stop showing up as untracked noise.
echo.

git add fc-fix-local-crm.bat .gitignore

echo --- staged ---
git status --short fc-fix-local-crm.bat .gitignore
echo.

git diff --cached --quiet
if not errorlevel 1 (
  echo   Nothing to commit. No action taken.
  echo.
  pause
  exit /b 0
)

git commit -m "Track fc-fix-local-crm.bat; ignore one-shot commit scripts" -m "fc-fix-local-crm.bat sets CRM_STAFF_EMAILS in .env.local, which no env pull copies down because merge-env.mjs carries only database keys. Without it /crm 404s on any fresh machine, including for the owner, because the staff gate fails closed." -m "fc-commit-*.bat and the Claude outputs folder are now ignored: a commit script is written for one commit and never used again, and keeping one per feature grows the repo root without end." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_018NzGH4mMjJUGjVVaQgVdRq"

if errorlevel 1 (
  echo.
  echo   COMMIT FAILED - nothing was pushed.
  echo.
  pause
  exit /b 1
)

echo.
echo   Pushing to main. This deploys.
echo.
git push origin main

echo.
echo   ----------------------------------------------------
echo   Still untracked on purpose, for you to decide:
echo.
echo     content/blog/how-to-become-hard-money-broker.mdx
echo.
echo   That is a BLOG POST sitting on this machine and not in
echo   the repo, so it is not on the live site. The blog
echo   engine has dropped posts this way before. Open it and
echo   tell Claude whether to publish it.
echo   ----------------------------------------------------
echo.
pause
