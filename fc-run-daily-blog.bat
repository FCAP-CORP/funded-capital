@echo off
setlocal
cd /d "%~dp0"
REM ==========================================================
REM  Funded Capital - run the daily blog cron NOW
REM
REM  Same thing Vercel does at 7am, on demand. Use it once
REM  after deploying, to see it work, or any morning a run
REM  failed and you retried the topic on the Marketing page.
REM
REM  It writes the NEXT topic in the queue even if a post was
REM  already drafted today (that is the "force" part). It never
REM  publishes anything. Takes 2 to 4 minutes.
REM ==========================================================

if not exist ".cron-secret" (
  echo   No .cron-secret here. Run fc-cron-setup.bat first.
  goto end
)

echo.
echo   Asking the website to write today's post. Wait 2-4 minutes...
echo.
node -e "const s=require('fs').readFileSync('.cron-secret','utf8').trim();fetch('https://www.fundedcapital.com/api/cron/daily-blog?force=1',{headers:{Authorization:'Bearer '+s},signal:AbortSignal.timeout(330000)}).then(async r=>{const j=await r.json().catch(()=>({}));console.log('  HTTP '+r.status);for(const[k,v]of Object.entries(j))console.log('  '+k+': '+(typeof v==='object'?JSON.stringify(v):v));process.exitCode=r.ok?0:1}).catch(e=>{console.log('  Could not reach the site: '+e.message);process.exitCode=1})"

echo.
echo   If it says drafted: true, open /crm/marketing to read it,
echo   then fc-pull-drafts.bat and publish-blog.bat as usual.
echo   If not, send Claude the lines above.

:end
echo.
pause
