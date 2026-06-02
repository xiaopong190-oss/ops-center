@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
echo.
echo Rebuilding app.bundle.js ...
echo.
node deploy/write-local-gist-config.mjs
node sync-browser.mjs
if errorlevel 1 goto fail
node deploy/build-browser-bundle.mjs
if errorlevel 1 goto fail
findstr /C:"GITHUB_GIST_ID" app.bundle.js >nul
if errorlevel 1 (
  echo [WARN] GitHub Gist config not found in bundle
) else (
  echo [OK] app.bundle.js includes GitHub Gist cloud sync
)
echo.
pause
exit /b 0

:fail
echo.
echo [FAIL] Check Node.js is installed
pause
exit /b 1
