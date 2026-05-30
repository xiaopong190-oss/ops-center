@echo off
cd /d "%~dp0"
title Ops Center
echo.
echo ========================================
echo   Ops Center
echo   %CD%
echo ========================================
echo.
echo Starting...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-open.ps1"
if errorlevel 1 (
  echo.
  echo Server failed. Opening app.html in browser...
  start "" "%~dp0app.html"
  echo.
)

pause
