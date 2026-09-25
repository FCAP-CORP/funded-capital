@echo off
cd /d C:\Users\luis\repos\funded-capital
echo.
echo === Make the Gmail token key ===
echo.
echo This makes a new random key and puts it on your clipboard.
echo It is NOT shown on screen and NOT saved anywhere.
echo.
node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64'))" | clip
if errorlevel 1 goto fail
echo DONE. The key is on your clipboard now.
echo.
echo Next: in Vercel, add a Production environment variable named
echo     GMAIL_TOKEN_KEY
echo and paste the key as its value (Ctrl+V). Do not paste it anywhere else.
echo.
echo If you ever lose or change it, just run this again, update Vercel,
echo and click Connect Gmail once more in Lending OS.
goto end
:fail
echo SOMETHING WENT WRONG - copy everything above and paste it to Claude.
:end
echo.
pause
