#Requires -Version 5.1
$ErrorActionPreference = 'Stop'
Set-ExecutionPolicy -Scope Process Bypass -Force -ErrorAction SilentlyContinue
Set-Location -LiteralPath $PSScriptRoot

Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

trap {
    Write-Host ''
    Write-Host "运行出错: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ScriptStackTrace) {
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    }
    Read-Host '按 Enter 退出'
    exit 1
}

Write-Host ''
Write-Host '========================================' -ForegroundColor Cyan
Write-Host '  C盘垃圾残留清理 - 第一步：预览' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

& "$PSScriptRoot\Clean-Residuals.ps1"

Write-Host ''
Write-Host '========================================' -ForegroundColor Yellow
Write-Host '  第二步：确认删除' -ForegroundColor Yellow
Write-Host '  将清理: 2345 / 360 / 鲁大师 等残留' -ForegroundColor Yellow
Write-Host '  不会删除: QQ / 微信 / 百度网盘 / WPS' -ForegroundColor Green
Write-Host '========================================' -ForegroundColor Yellow
Write-Host ''

$ans = Read-Host '确认删除以上预览项? 输入 Y 继续, 其他键取消'
if ($ans -notin @('Y', 'y')) {
    Write-Host '已取消，未删除任何文件。' -ForegroundColor DarkGray
    Read-Host '按 Enter 退出'
    exit 0
}

& "$PSScriptRoot\Clean-Residuals.ps1" -Confirm

Write-Host ''
Write-Host '清理完成。建议再运行: .\Scan-JunkSoftware.ps1 -ExportReport' -ForegroundColor Green
Read-Host '按 Enter 退出'
