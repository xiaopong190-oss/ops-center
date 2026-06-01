@echo off
cd /d "%~dp0"
echo.
echo === Push cloud-14 to GitHub ===
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DEPLOY-NOW.ps1"
set ERR=%ERRORLEVEL%
echo.
if %ERR%==0 (echo OK - refresh page, look for cloud-14) else (echo FAILED exit %ERR% - see _push-log.txt)
echo.
pause
exit /b %ERR%
