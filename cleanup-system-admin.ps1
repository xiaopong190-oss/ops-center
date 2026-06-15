# 需要管理员权限 — 右键「以管理员身份运行 PowerShell」后执行:
#   powershell -ExecutionPolicy Bypass -File "D:\Projects\ops-center\cleanup-system-admin.ps1"

$ErrorActionPreference = 'Continue'
$log = Join-Path $env:USERPROFILE 'system-cleanup-admin.log'
Start-Transcript -Path $log -Force | Out-Null

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

$before = (Get-PSDrive C).Free

Step '停止 Windows Update 服务并清理更新缓存'
Stop-Service wuauserv -Force -ErrorAction SilentlyContinue
$dl = 'C:\Windows\SoftwareDistribution\Download'
if (Test-Path $dl) {
    Remove-Item "$dl\*" -Recurse -Force -ErrorAction SilentlyContinue
}
Start-Service wuauserv -ErrorAction SilentlyContinue

Step '清理 Windows 临时目录'
Remove-Item 'C:\Windows\Temp\*' -Recurse -Force -ErrorAction SilentlyContinue

Step 'DISM 组件存储清理（约 5-15 分钟）'
dism /Online /Cleanup-Image /StartComponentCleanup

Step '磁盘清理 — 系统文件'
# 预设：临时文件、更新缓存、传递优化、缩略图、回收站
$set = 1
$categories = @(
    'Temporary Files',
    'Temporary Setup Files',
    'Windows Update Cleanup',
    'Delivery Optimization Files',
    'Thumbnails',
    'Recycle Bin'
)
$volumeCaches = Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches'
foreach ($cat in $categories) {
    $key = $volumeCaches | Where-Object { $_.PSChildName -eq $cat }
    if ($key) {
        Set-ItemProperty -Path $key.PSPath -Name StateFlags0001 -Value 2 -Type DWord -ErrorAction SilentlyContinue
    }
}
Start-Process cleanmgr -ArgumentList "/sagerun:$set" -Wait -NoNewWindow

$after = (Get-PSDrive C).Free
$mb = [math]::Round(($after - $before) / 1MB, 0)
Write-Host "`n完成。C 盘额外释放约 $mb MB。日志: $log" -ForegroundColor Green
Stop-Transcript | Out-Null
