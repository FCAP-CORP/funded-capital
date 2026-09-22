@echo off
setlocal
REM ==========================================================
REM  Funded Capital - commit ONLY the Phase 2a broker work
REM
REM  Your working tree has other unfinished work in it
REM  (revenue share, participant portal admin, a blog post).
REM  Push = deploy, so this commits ONLY the broker files and
REM  leaves everything else exactly where it is.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo   Committing Phase 2a - broker scoping
echo ============================================
echo.

git add lib/broker/
git add lib/db/schema.ts
git add lib/crm/view.ts
git add lib/crm/schema-sync.regress.ts
git add drizzle/0001_broker_firms.sql
git add drizzle/meta/
git add package.json
git add drizzle.config.ts
git add CLAUDE.md

echo These files will be committed:
echo.
git status --short --untracked-files=no
echo.

git commit -m "Phase 2a: broker firms, roles and the scoping rules" -m "Adds broker_firms and broker_users, plus submitted_by_user_id and broker_firm_id on applications. lib/broker/scope.ts is the single place that decides what a broker may see; 49 tests cover it. Migration 0001 is additive only and has NOT been run yet." -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_018NzGH4mMjJUGjVVaQgVdRq"
set RESULT=%errorlevel%

if not "%RESULT%"=="0" (
  echo.
  echo ============================================
  echo   COMMIT DID NOT RUN - see the message above
  echo   Nothing was pushed. Tell Claude what it said.
  echo ============================================
  echo.
  pause
  exit /b 1
)

echo.
echo Pushing to main - this deploys to Vercel...
git push
set PUSHED=%errorlevel%

echo.
if "%PUSHED%"=="0" (
  echo ============================================
  echo   DONE - committed and pushed.
  echo   Your other unfinished work is untouched.
  echo ============================================
) else (
  echo ============================================
  echo   Committed, but the PUSH failed.
  echo   Tell Claude what the message above says.
  echo ============================================
)
echo.
pause
