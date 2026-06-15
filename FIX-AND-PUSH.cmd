@echo off
cd /d D:\Projects\ops-center
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0FIX-AND-PUSH.ps1"
