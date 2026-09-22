@echo off
REM ==========================================================
REM  Funded Capital - generate CRM_SYNC_SECRET
REM
REM  Makes one cryptographically random 64-character secret
REM  and copies it to the clipboard. Nothing leaves this PC.
REM  Double-click to run.
REM ==========================================================

echo.
echo  ============================================================
echo    GENERATING CRM_SYNC_SECRET
echo  ============================================================

powershell -NoProfile -Command "$b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); $s = [BitConverter]::ToString($b).Replace('-','').ToLower(); Set-Clipboard -Value $s; Write-Host ''; Write-Host '  Copied to your clipboard:' -ForegroundColor Green; Write-Host ''; Write-Host ('    ' + $s) -ForegroundColor Yellow; Write-Host ''"

echo  ============================================================
echo    WHERE IT GOES - paste the SAME value in both places:
echo.
echo    1. Vercel   Settings ^> Environment Variables ^> Production
echo                Name:  CRM_SYNC_SECRET
echo                Then REDEPLOY. Env vars only apply to a new build.
echo.
echo    2. Apps Script   Project Settings ^> Script Properties
echo                     Property:  CRM_SYNC_SECRET
echo.
echo    Do not paste it into chat, email or a document.
echo    Lost it? Just run this again and update both places.
echo  ============================================================
echo.
pause
