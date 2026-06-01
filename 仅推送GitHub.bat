@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo ========================================
echo   Push only (commit already done)
echo   If this fails, run: gh auth login
echo ========================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\push-only.ps1"
set ERR=%ERRORLEVEL%
echo.
if "%ERR%"=="0" (
  echo [OK] Pushed. Wait 1-2 min, Ctrl+F5 refresh Pages.
) else (
  echo [FAIL] See _push-result.txt
  if exist _push-result.txt type _push-result.txt
)
echo.
pause
exit /b %ERR%
