@echo off
cd /d "%~dp0"
echo == sync browser jsx ==
node sync-browser.mjs
if errorlevel 1 exit /b 1
echo.
echo == done. commit and push to trigger GitHub Pages rebuild ==
echo    git add sync-browser.mjs src app.html
echo    git commit -m "fix: dedupe confirmDeleteWarning for Pages"
echo    git push origin main
