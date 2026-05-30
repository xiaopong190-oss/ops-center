@echo off
cd /d "%~dp0"
title Ops Center Dev

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js not found.
  echo.
  echo Use run.bat instead - no Node required.
  echo Or install Node from https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo Project: %CD%
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: npm install failed. Use run.bat instead.
    pause
    exit /b 1
  )
)

echo.
echo Dev server: http://localhost:5173
echo Press Ctrl+C to stop
call npm run dev
pause
