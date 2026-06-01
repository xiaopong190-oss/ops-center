@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo ========================================
echo   Push to GitHub - GitHub Pages deploy
echo   Wait 1-2 min after success, then Ctrl+F5
echo   New version shows "cloud-8" top-left
echo ========================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\push-github.ps1"
set ERR=%ERRORLEVEL%
echo.
if "%ERR%"=="0" (
  echo [OK] https://github.com/xiaopong190-oss/ops-center
) else (
  echo [FAIL] See _push-result.txt for details
  if exist _push-result.txt type _push-result.txt
)
echo.
pause
exit /b %ERR%
