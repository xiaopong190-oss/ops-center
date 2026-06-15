#Requires -Version 5.1
<#
  步骤 1：清除系统瘦身 / sys_clean_tray 残留
  步骤 2：卸载毒霸、联想管家、WintRAR+、火绒应用商店、Windows系统瘦身
  步骤 3：C 盘系统清理（临时文件、回收站、更新缓存等）
#>
$ErrorActionPreference = 'Continue'
$log = Join-Path $PSScriptRoot 'Run-Step123-last-run.log'
function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding UTF8
}

if (Test-Path $log) { Remove-Item $log -Force }
Log '========== C盘瘦身 步骤 1-2-3 =========='

# --- 步骤 1 ---
Log '--- 步骤1: 清除系统瘦身残留 ---'
& (Join-Path $PSScriptRoot 'Remove-SysClean.ps1') 2>&1 | ForEach-Object { Log $_ }

$uninst = 'C:\Program Files (x86)\LdsSysClean\uninst.exe'
if (Test-Path -LiteralPath $uninst) {
    Log "运行官方卸载: $uninst"
    Start-Process -FilePath $uninst -ArgumentList '/S' -Wait -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    & (Join-Path $PSScriptRoot 'Remove-SysClean.ps1') 2>&1 | Out-Null
}

# --- 步骤 2 ---
Log '--- 步骤2: 卸载指定软件 ---'
$targets = @(
    @{ Name = '金山毒霸'; Path = 'C:\Program Files (x86)\kingsoft\kingsoft antivirus\uni0nst.exe'; Args = '/quiet' }
    @{ Name = '毒霸看图'; Path = 'C:\Program Files (x86)\kingsoft\kingsoft antivirus\kfastpicshell.exe'; Args = '/uninstall /silent' }
    @{ Name = '联想电脑管家'; Path = 'C:\Program Files (x86)\Lenovo\PCManager\5.1.190.5202\uninst.exe'; Args = '/S' }
    @{ Name = 'WintRAR+'; Path = 'C:\Program Files (x86)\wintrar\uninstall.exe'; Args = '/S' }
    @{ Name = '火绒应用商店'; Path = 'C:\Program Files\Huorong\AppStore\HrAppStoreUninst.exe'; Args = '' }
    @{ Name = 'Windows系统瘦身'; Path = 'C:\Program Files (x86)\LdsSysClean\uninst.exe'; Args = '/S' }
)

foreach ($t in $targets) {
    if (-not (Test-Path -LiteralPath $t.Path)) {
        Log "SKIP $($t.Name): 未找到 $($t.Path)"
        continue
    }
    Log "UNINSTALL $($t.Name): $($t.Path)"
    try {
        if ($t.Args) {
            Start-Process -FilePath $t.Path -ArgumentList $t.Args -Wait -ErrorAction Stop
        } else {
            Start-Process -FilePath $t.Path -Wait -ErrorAction Stop
        }
        Log "OK $($t.Name)"
    } catch {
        Log "FAIL $($t.Name): $_"
    }
    Start-Sleep -Seconds 2
}

# 联想管家可能版本路径不同，尝试通配
Get-ChildItem 'C:\Program Files (x86)\Lenovo\PCManager' -Filter 'uninst.exe' -Recurse -EA SilentlyContinue | ForEach-Object {
    if ($_.FullName -notmatch '5\.1\.190\.5202') {
        Log "UNINSTALL 联想管家(alt): $($_.FullName)"
        Start-Process -FilePath $_.FullName -ArgumentList '/S' -Wait -EA SilentlyContinue
    }
}

# --- 步骤 3 ---
Log '--- 步骤3: C盘清理 ---'

function Clear-FolderSafe($path) {
    if (-not (Test-Path -LiteralPath $path)) { return 0 }
    $freed = [int64]0
    Get-ChildItem -LiteralPath $path -Force -EA SilentlyContinue | ForEach-Object {
        try {
            if ($_.PSIsContainer) {
                $size = (Get-ChildItem $_.FullName -Recurse -File -EA SilentlyContinue | Measure-Object Length -Sum).Sum
                Remove-Item $_.FullName -Recurse -Force -EA Stop
                $freed += [int64]$size
            } else {
                $freed += $_.Length
                Remove-Item $_.FullName -Force -EA Stop
            }
        } catch { Log "  skip: $($_.FullName)" }
    }
    return $freed
}

$tempPaths = @($env:TEMP, 'C:\Windows\Temp', "$env:LOCALAPPDATA\Temp")
$totalFreed = [int64]0
foreach ($tp in $tempPaths) {
    $f = Clear-FolderSafe $tp
    $totalFreed += $f
    Log "清理 Temp $tp : $([math]::Round($f/1MB,2)) MB"
}

# 回收站
try {
    Clear-RecycleBin -Force -ErrorAction Stop
    Log '已清空回收站'
} catch {
    $shell = New-Object -ComObject Shell.Application
    $rb = $shell.Namespace(0x0a)
    if ($rb) { $rb.Items() | ForEach-Object { Remove-Item $_.Path -Recurse -Force -EA SilentlyContinue }; Log '已清空回收站(com)' }
    else { Log "回收站清理跳过: $_" }
}

# Windows 磁盘清理（预设常用项）
try {
    Log '运行 Windows 组件清理...'
    Start-Process -FilePath 'Dism.exe' -ArgumentList '/online','/Cleanup-Image','/StartComponentCleanup' -Wait -NoNewWindow -EA SilentlyContinue
    Log 'DISM 组件清理完成'
} catch { Log "DISM skip: $_" }

# cleanmgr 自动配置并运行
try {
    $volumeCaches = Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches' -EA SilentlyContinue
    if ($volumeCaches) {
        $volumeCaches | ForEach-Object {
            New-ItemProperty -Path $_.PSPath -Name StateFlags0001 -Value 2 -PropertyType DWord -Force -EA SilentlyContinue | Out-Null
        }
        Log '启动 cleanmgr /sagerun:1 ...'
        Start-Process -FilePath 'cleanmgr.exe' -ArgumentList '/sagerun:1' -Wait -NoNewWindow -EA SilentlyContinue
        Log 'cleanmgr 完成'
    }
} catch { Log "cleanmgr skip: $_" }

Log "Temp 合计约释放: $([math]::Round($totalFreed/1MB,2)) MB"

# 强制删除卸载后残留目录（需管理员）
$forceDelete = @(
    'C:\Program Files (x86)\LdsSysClean'
    'C:\Program Files (x86)\wintrar'
    'C:\Program Files\Huorong\AppStore'
    'C:\Program Files (x86)\Lenovo'
    'C:\Program Files (x86)\kingsoft'
)
foreach ($dir in $forceDelete) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    try {
        Remove-Item -LiteralPath $dir -Recurse -Force
        Log "FORCE DELETED: $dir"
    } catch { Log "FORCE FAILED: $dir - $_" }
}

# 复查
Log '--- 复查 ---'
@(
    'C:\Program Files (x86)\LdsSysClean'
    "$env:APPDATA\LdsSysClean"
    'C:\Program Files (x86)\kingsoft'
    'C:\Program Files (x86)\Lenovo'
    'C:\Program Files (x86)\wintrar'
    'C:\Program Files\Huorong\AppStore'
) | ForEach-Object {
    $exists = Test-Path -LiteralPath $_
    Log "存在? $exists : $_"
}

$drive = Get-PSDrive C
Log "C盘剩余: $([math]::Round($drive.Free/1GB,2)) GB / 已用 $([math]::Round($drive.Used/1GB,2)) GB"
Log '========== 完成！建议重启电脑 =========='
Log "详细日志: $log"
