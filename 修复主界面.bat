@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo 正在修复并重建主界面...
node sync-browser.mjs
if errorlevel 1 goto fail
node deploy/build-browser-bundle.mjs
if errorlevel 1 goto fail
node deploy/verify-browser-boot.mjs
if errorlevel 1 goto fail
echo.
echo [OK] 修复完成。请关闭浏览器后重新双击「启动运营中心.bat」
echo.
pause
exit /b 0

:fail
echo.
echo [FAIL] 修复失败，请确认已安装 Node.js
pause
exit /b 1
