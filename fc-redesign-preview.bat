@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================================
echo   Website redesign - publish a PREVIEW (not the live site)
echo ==========================================================
echo.
echo   This puts the new design on its own branch, redesign-ledger.
echo   Vercel builds a private preview link for it. The live site
echo   does not change until you approve and we merge it.
echo.
echo   BEFORE THIS, run these first (in order):
echo     1. fc-check.bat                   (must say HEALTHY)
echo     2. fc-commit-blog-quality.bat
echo     3. fc-commit-claim-fixes.bat
echo     4. publish-blog.bat               (if you have posts waiting)
echo.
echo   This script refuses to run while those are still uncommitted,
echo   so nothing from them can end up on the wrong branch.
echo.
pause

findstr /x /c:".redesign/" .git\info\exclude >nul 2>&1
if errorlevel 1 echo .redesign/>> .git\info\exclude

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%B
if not "%BRANCH%"=="main" (
  echo   You are on branch %BRANCH%, not main. Run: git checkout main
  goto fail
)

set DIRTY=
for /f "delims=" %%L in ('git status --porcelain --untracked-files=no') do set DIRTY=1
if defined DIRTY (
  echo   STOPPED: there are uncommitted changes. Run steps 1-4 above
  echo   first, then run this again. Nothing was changed.
  git status --short --untracked-files=no
  goto fail
)

git pull --ff-only origin main
if errorlevel 1 goto fail

git checkout -B redesign-ledger
if errorlevel 1 goto fail

xcopy /E /Y /I /Q ".redesign\*" "." >nul
if errorlevel 1 (
  echo   Copy failed.
  git checkout main
  goto fail
)

git add -A "app/layout.tsx" "app/globals.css" "tailwind.config.ts" "components/SiteChrome.tsx" "components/Header.tsx" "components/Footer.tsx" "components/site/Logo.tsx" "components/site/ui.tsx" "components/site/ProgramPage.tsx" "components/site/HomePhotoBand.tsx" "public/images/home-neighborhood-wide.jpg" "public/images/home-neighborhood-tall.jpg" "lib/site/facts.ts" "app/page.tsx" "app/not-found.tsx" "app/fix-and-flip-loans/page.tsx" "app/dscr-loans/page.tsx" "app/new-construction-loans/page.tsx" "app/multifamily-loans/page.tsx" "app/loan-programs/page.tsx" "app/why-us/page.tsx" "app/how-it-works/page.tsx" "app/about/page.tsx" "app/contact/page.tsx" "app/thank-you/page.tsx" "app/broker-program/page.tsx" "app/broker-program/register/page.tsx" "app/apply/page.tsx" "app/blog/page.tsx" "app/blog/[slug]/page.tsx" "app/calculator/page.tsx" "app/calculator/CalculatorClient.tsx" "app/privacy/page.tsx" "app/terms/page.tsx" "components/ApplyForm.tsx" "components/ContactForm.tsx" "components/BrokerForm.tsx" "components/SmsConsentField.tsx" 
git commit -m "Public site redesign: Ledger (Inter Tight headlines, Inter body, mono figures, deep/brass/bone palette)" -m "Every public page rebuilt on shared parts (components/site, lib/site/facts.ts) so figures live in one place. Fonts are self-hosted with next/font, replacing a render-blocking Google Fonts import. The look is scoped to a .site wrapper through :where(), so the portals and the CRM are unchanged; form components changed className strings only. Adds a branded not-found page. The home page carries the site's only photograph, a below-the-fold band (Adobe Stock 321718959, licensed) under navy overlays." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_019FJSPLhnDRPvg6GpGPkMTV"
if errorlevel 1 (
  git checkout main
  goto fail
)

git push -u origin redesign-ledger --force-with-lease
set PUSHED=%errorlevel%
git checkout main

if not "%PUSHED%"=="0" goto fail

echo.
echo ==========================================================
echo   Preview is building. In about 2 minutes open Vercel:
echo   https://vercel.com/fcap-f6041836/funded-capital/deployments
echo   Click the newest "redesign-ledger" deployment, then Visit.
echo   You are back on main; the live site is untouched.
echo ==========================================================
pause
exit /b 0

:fail
echo.
echo   Nothing was published.
pause
exit /b 1
