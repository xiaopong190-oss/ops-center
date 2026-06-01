@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\squash-push.ps1"
set ERR=%ERRORLEVEL%
echo.
if %ERR%==0 (echo OK) else (echo FAILED exit %ERR%)
echo.
pause
exit /b %ERR%
