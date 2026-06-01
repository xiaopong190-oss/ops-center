@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0" || goto :fail_cd

title C盘垃圾清理

echo.
echo ========================================
echo   C盘垃圾清理工具
echo ========================================
echo.

if not exist "%~dp0Start-Cleanup.ps1" (
  set "ERR=1"
  echo [错误] 找不到 Start-Cleanup.ps1
  echo.
  echo 请确认：
  echo   1. 已完整解压 zip 到文件夹（如 D:\disk-cleaner）
  echo   2. 不要直接在压缩包里面双击运行
  echo   3. 解压后应能看到多个 .bat 和 .ps1 文件
  goto :fail
)

if not exist "%~dp0Clean-Residuals.ps1" (
  set "ERR=1"
  echo [错误] 文件不完整，请重新下载 disk-cleaner-win.zip
  goto :fail
)

where powershell.exe >nul 2>&1
if errorlevel 1 (
  set "ERR=1"
  echo [错误] 未找到 PowerShell，需要 Windows 10 / 11
  goto :fail
)

echo 正在解除下载锁定（如有）...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -File | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1

echo 正在启动，请稍候...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; Set-Location -LiteralPath '%~dp0'; try { & '.\Start-Cleanup.ps1'; exit 0 } catch { Write-Host ''; Write-Host '[错误]' $_.Exception.Message -ForegroundColor Red; if ($_.ScriptStackTrace) { Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray }; exit 1 }"

set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" goto :fail

echo.
echo 运行结束。
pause
exit /b 0

:fail_cd
set "ERR=1"
echo [错误] 无法进入目录: %~dp0
goto :fail

:fail
if not defined ERR set "ERR=1"
echo.
echo ========================================
echo 运行失败（代码 %ERR%）
echo.
echo 常见原因：
echo   1. zip 未解压 — 请解压后再双击本 bat
echo   2. 下载被拦截 — 右键 zip -^> 属性 -^> 勾选「解除锁定」后重新解压
echo   3. 路径含特殊符号 — 建议放到 D:\disk-cleaner
echo   4. 公司电脑禁止脚本 — 联系 IT 或右键「以管理员身份运行」
echo.
echo 仍不行请运行「诊断环境.bat」并把生成的日志发给管理员
echo ========================================
echo.
pause
exit /b 1
