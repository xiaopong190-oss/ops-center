@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title C盘清理 - 环境诊断

set "LOG=%~dp0诊断日志.txt"
echo ===== C盘清理工具 环境诊断 ===== > "%LOG%"
echo 时间: %date% %time% >> "%LOG%"
echo 目录: %~dp0 >> "%LOG%"
echo. >> "%LOG%"

echo 正在收集信息，请稍候...
echo.

echo [系统] >> "%LOG%"
ver >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [PowerShell] >> "%LOG%"
where powershell.exe >> "%LOG%" 2>&1
powershell.exe -NoProfile -Command "$PSVersionTable.PSVersion.ToString()" >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [文件清单] >> "%LOG%"
dir /b "%~dp0" >> "%LOG%" 2>&1
echo. >> "%LOG%"

echo [试跑预览脚本] >> "%LOG%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Set-Location -LiteralPath '%~dp0'; Get-ChildItem -Recurse -File | Unblock-File -ErrorAction SilentlyContinue; & '.\Clean-Residuals.ps1'" >> "%LOG%" 2>&1
set "ERR=%ERRORLEVEL%"
echo 退出代码: %ERR% >> "%LOG%"

echo.
echo ===== 诊断完成 =====
echo 日志已保存: %LOG%
echo 退出代码: %ERR%
echo.
type "%LOG%"
echo.
pause
exit /b %ERR%
