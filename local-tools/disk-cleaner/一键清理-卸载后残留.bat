@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title C盘垃圾清理 - 卸载后残留

powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-PostUninstallCleanup.ps1"
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" (
  echo.
  echo [错误] 运行失败，错误代码: %ERR%
  echo 若从 zip 下载，请右键 zip -^> 属性 -^> 勾选「解除锁定」后重新解压。
)
pause
exit /b %ERR%
