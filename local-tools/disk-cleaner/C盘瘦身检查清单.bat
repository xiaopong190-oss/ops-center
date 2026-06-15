@echo off
chcp 65001 >nul
cd /d "%~dp0"
title C盘瘦身检查清单
echo.
echo ========== C盘空间 ==========
powershell -NoProfile -Command "Get-PSDrive C | ForEach-Object { Write-Host ('C盘 已用: {0:N2} GB  剩余: {1:N2} GB' -f ($_.Used/1GB), ($_.Free/1GB)) }"
echo.
echo ========== 垃圾/残留目录 ==========
powershell -NoProfile -Command "$p=@('C:\Program Files (x86)\LdsSysClean','$env:APPDATA\LdsSysClean','C:\Program Files (x86)\kingsoft','C:\Program Files (x86)\Lenovo','C:\Program Files (x86)\wintrar','C:\Program Files\Huorong\AppStore'); foreach($x in $p){ Write-Host ((Test-Path -LiteralPath $x).ToString().PadRight(6) + ' ' + $x) }"
echo.
echo ========== 用户目录大小 TOP10 ==========
powershell -NoProfile -Command "Get-ChildItem $env:USERPROFILE -Directory -EA SilentlyContinue | ForEach-Object { $s=(Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum; [PSCustomObject]@{GB=[math]::Round($s/1GB,2);Name=$_.Name} } | Sort-Object GB -Desc | Select-Object -First 10 | Format-Table -AutoSize"
echo.
echo ========== 建议卸载(若仍存在) ==========
powershell -NoProfile -Command "Get-ItemProperty HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*,HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* -EA SilentlyContinue | Where-Object { $_.DisplayName -match '毒霸|联想|WintRAR|WinZips|系统瘦身|火绒应用' } | Select-Object DisplayName | Format-Table -HideTableHeaders"
echo.
pause
