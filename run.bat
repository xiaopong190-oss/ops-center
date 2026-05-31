@echo off
cd /d "%~dp0"
set "ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'powershell.exe' -WorkingDirectory '%ROOT%' -ArgumentList @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File','%ROOT%serve-open.ps1') -WindowStyle Hidden"
exit /b 0
