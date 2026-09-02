@echo off
setlocal
REM ==========================================================
REM  Funded Capital - deploy diagnostic
REM  Shows the real state and reports honestly whether the
REM  push reached GitHub. Double-click, then send Luis's
REM  assistant a photo or copy of everything below.
REM ==========================================================

cd /d "C:\Users\luis\repos\funded-capital"

echo ============================================
echo  1. CURRENT BRANCH
echo ============================================
git rev-parse --abbrev-ref HEAD
echo.

echo ============================================
echo  2. ARE THE TWO IMAGES TRACKED BY GIT?
echo ============================================
git ls-files --error-unmatch public/bp-featured-lender.png >nul 2>&1
if errorlevel 1 (echo   bp-featured-lender.png  NOT TRACKED) else (echo   bp-featured-lender.png  tracked)
git ls-files --error-unmatch public/profile-luis.png >nul 2>&1
if errorlevel 1 (echo   profile-luis.png        NOT TRACKED) else (echo   profile-luis.png        tracked)
echo.

echo ============================================
echo  3. LAST 3 COMMITS ON THIS MACHINE
echo ============================================
git log --oneline -3
echo.

echo ============================================
echo  4. CHECKING GITHUB...
echo ============================================
git fetch origin
if errorlevel 1 (
  echo.
  echo   ^>^> COULD NOT REACH GITHUB. This is the problem.
  echo   ^>^> Usually an expired login or no internet.
  goto done
)
echo   Connected to GitHub OK.
echo.

echo ============================================
echo  5. COMMITS NOT YET ON GITHUB
echo ============================================
git log origin/main..HEAD --oneline
if errorlevel 1 goto pushit
echo.

:pushit
echo ============================================
echo  6. PUSHING NOW
echo ============================================
git push origin HEAD
if errorlevel 1 (
  echo.
  echo   ^>^> PUSH FAILED. The error is printed above.
  echo   ^>^> Nothing reached GitHub, so Vercel has nothing to deploy.
  goto done
)
echo.
echo   ^>^> PUSH SUCCEEDED. Vercel is deploying now.
echo   ^>^> Wait 2 minutes, then open:
echo   ^>^>   https://www.fundedcapital.com/bp-featured-lender.png

:done
echo.
echo ============================================
echo  Done. Copy everything above and send it.
echo ============================================
pause
