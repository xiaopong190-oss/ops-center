#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-ExecutionPolicy -Scope Process Bypass -Force -ErrorAction SilentlyContinue
Set-Location $PSScriptRoot

Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '请先确认已在 [设置 - 应用] 中卸载:' -ForegroundColor Yellow
Write-Host '  - 金山毒霸'
Write-Host '  - 联想电脑管家'
Write-Host ''
Write-Host '若仍在使用 WPS，脚本会自动跳过 kingsoft 相关目录。' -ForegroundColor DarkGray
Write-Host ''

$ok = Read-Host '已卸载上述软件? 输入 Y 继续, 其他键取消'
if ($ok -notin @('Y', 'y')) {
    Write-Host '已取消。' -ForegroundColor DarkGray
    Read-Host '按 Enter 退出'
    exit 0
}

Write-Host ''
Write-Host '--- 预览 ---' -ForegroundColor Cyan
& "$PSScriptRoot\Clean-Residuals.ps1" -IncludePostUninstall

Write-Host ''
$ans = Read-Host '确认删除? 输入 Y 继续, 其他键取消'
if ($ans -notin @('Y', 'y')) {
    Write-Host '已取消。' -ForegroundColor DarkGray
    Read-Host '按 Enter 退出'
    exit 0
}

& "$PSScriptRoot\Clean-Residuals.ps1" -IncludePostUninstall -Confirm

Write-Host ''
Write-Host '完成。' -ForegroundColor Green
Read-Host '按 Enter 退出'
