@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title C盘垃圾清理 - 执行删除

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Clean-Residuals.ps1" -Confirm
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" echo [错误] 错误代码: %ERR%
pause
exit /b %ERR%
