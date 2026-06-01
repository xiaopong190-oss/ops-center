@echo off
cd /d "%~dp0"
echo.
echo === Retry git push only (commit 93b01bc already local) ===
echo     Use VPN / hotspot if GitHub 443 blocked
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0RETRY-PUSH.ps1"
exit /b %ERRORLEVEL%
