@echo off
cd /d "%~dp0"
echo === ops-center version check ===
findstr /c:"cloud-14" /c:"cloud-9" /c:"configVersion" app.bundle.js app.html src\App.browser.jsx 2>nul
echo.
echo If app.bundle.js shows cloud-14 and NO configVersion, local bundle is OK.
echo Then double-click PUSH.bat to upload.
echo.
pause
