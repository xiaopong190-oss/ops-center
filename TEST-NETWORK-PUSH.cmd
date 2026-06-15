@echo off
cd /d D:\Projects\ops-center
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0TEST-NETWORK-PUSH.ps1"
pause
