@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0DEPLOY-NOW.ps1"
exit /b %ERRORLEVEL%
