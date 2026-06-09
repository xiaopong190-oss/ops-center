#Requires -Version 5.1
$ErrorActionPreference = 'Continue'
$log = Join-Path $PSScriptRoot 'Remove-SysClean-last-run.log'
function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding UTF8
}
Log '=== Remove-SysClean start ==='
$names = @('sys_clean_tray', 'sys_clean', 'LdsSysClean', 'ldssysclean')
foreach ($n in $names) {
    Get-Process -Name $n -ErrorAction SilentlyContinue | ForEach-Object {
        Log "KILL: $($_.ProcessName) pid=$($_.Id)"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}
$pattern = 'sys_clean|LdsSys|SysClean|ludashi|奇鲁'
$regPaths = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce'
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'
)
foreach ($rp in $regPaths) {
    if (-not (Test-Path -LiteralPath $rp)) { continue }
    $props = Get-ItemProperty -LiteralPath $rp -ErrorAction SilentlyContinue
    foreach ($p in $props.PSObject.Properties) {
        if ($p.Name -match '^PS') { continue }
        $val = [string]$p.Value
        if ($p.Name -match $pattern -or $val -match $pattern) {
            try {
                Remove-ItemProperty -LiteralPath $rp -Name $p.Name -Force
                Log "REG REMOVE: $rp\$($p.Name)"
            } catch { Log "REG FAILED: $rp\$($p.Name) - $_" }
        }
    }
}
Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
    $_.TaskName -match $pattern -or ($_.Actions.Execute + $_.Actions.Arguments) -match $pattern
} | ForEach-Object {
    try {
        Unregister-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -Confirm:$false
        Log "TASK REMOVED: $($_.TaskName)"
    } catch { Log "TASK FAILED: $($_.TaskName)" }
}
$folders = @(
    'C:\Program Files (x86)\LdsSysClean'
    'C:\Program Files\LdsSysClean'
    (Join-Path $env:APPDATA 'LdsSysClean')
    (Join-Path $env:APPDATA 'ludashi')
)
Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Directory -Filter 'SysCleaner-*' -EA SilentlyContinue | ForEach-Object { $folders += $_.FullName }
foreach ($dir in $folders) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    try {
        Remove-Item -LiteralPath $dir -Recurse -Force
        Log "DELETED FOLDER: $dir"
    } catch { Log "FOLDER FAILED: $dir - $_" }
}
Log '=== done ==='
