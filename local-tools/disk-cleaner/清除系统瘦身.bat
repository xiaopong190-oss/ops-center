@echo off
cd /d "%~dp0"
title 清除系统瘦身残留
echo.
echo 正在清除 sys_clean_tray / LdsSysClean ...
echo 若 Program Files 删不掉，请右键本文件 - 以管理员身份运行
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Remove-SysClean.ps1"
pause
