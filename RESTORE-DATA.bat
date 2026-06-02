@echo off
cd /d "%~dp0"
echo.
echo === 从本机浏览器恢复数据到云端 ===
echo.
echo 1) 若未启动本机服务，先双击 run.bat
echo 2) 浏览器打开: http://127.0.0.1:8765/tools/backup-local-data.html
echo    （端口以 serve-open.ps1 实际为准，常见 8765）
echo 3) 点「下载 local-backup.json」，保存到:
echo    %~dp0data\local-backup.json
echo.
pause
echo.
if not exist "%~dp0data\local-backup.json" (
  echo 未找到 data\local-backup.json — 请先完成导出
  pause
  exit /b 1
)
node "%~dp0deploy\push-backup-to-jsonbin.mjs"
if errorlevel 1 (
  echo 上传失败
  pause
  exit /b 1
)
echo.
echo 上传成功。正在部署到 GitHub Pages...
call "%~dp0DEPLOY-NOW.bat"
exit /b %ERRORLEVEL%
