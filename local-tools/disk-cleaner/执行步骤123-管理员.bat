@echo off
cd /d "%~dp0"
title C盘瘦身 步骤1-2-3
echo.
echo ========================================
echo   步骤1 清除系统瘦身残留
echo   步骤2 卸载毒霸/联想管家/WintRAR等
echo   步骤3 C盘系统清理
echo ========================================
echo.
echo 请确保以管理员身份运行本文件
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-Step123.ps1"
echo.
echo 完成后请重启电脑
pause
