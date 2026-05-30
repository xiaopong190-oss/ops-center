#Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [switch]$IncludePostUninstall,
    [switch]$Force,
    [string]$UserProfile = $env:USERPROFILE
)

$ErrorActionPreference = 'Stop'
$ExecuteDelete = $Force.IsPresent -or $PSBoundParameters.ContainsKey('Confirm')

function Join-UserPath {
    param([string]$Relative)
    Join-Path $UserProfile $Relative
}

$ProtectedPaths = @(
    (Join-UserPath 'AppData\Roaming\Tencent')
    (Join-UserPath 'AppData\Local\Tencent')
    'C:\Program Files\Tencent'
    (Join-UserPath 'AppData\Roaming\baidu')
    (Join-UserPath 'AppData\Roaming\BaiduYunGuanjia')
    (Join-UserPath 'AppData\Roaming\BaiduYunKernel')
    (Join-UserPath 'AppData\Local\Kingsoft\WPS Office')
    (Join-UserPath 'AppData\Local\Programs\cursor')
    (Join-UserPath 'AppData\Local\Feishu')
    (Join-UserPath 'AppData\Local\JianyingPro')
)

function Test-ProtectedPath {
    param([string]$Path)
    $normalized = [System.IO.Path]::GetFullPath($Path)
    foreach ($p in $ProtectedPaths) {
        $protectedNorm = [System.IO.Path]::GetFullPath($p)
        if ($normalized -eq $protectedNorm -or $normalized.StartsWith($protectedNorm + [IO.Path]::DirectorySeparatorChar)) {
            return $true
        }
    }
    return $false
}

function Get-SafeSum {
    param([object[]]$Items, [string]$Property = 'Size')
    if (-not $Items -or $Items.Count -eq 0) { return [int64]0 }
    $measured = $Items | Measure-Object -Property $Property -Sum -ErrorAction SilentlyContinue
    if ($null -eq $measured -or $null -eq $measured.Sum) { return [int64]0 }
    return [int64]$measured.Sum
}

function Get-FolderSize {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return [int64]0 }
    $files = @(Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue)
    if ($files.Count -eq 0) { return [int64]0 }
    $measured = $files | Measure-Object -Property Length -Sum
    if ($null -eq $measured -or $null -eq $measured.Sum) { return [int64]0 }
    return [int64]$measured.Sum
}

function Format-Size {
    param($Bytes)
    $value = [int64]0
    if ($null -ne $Bytes) { $value = [int64]$Bytes }
    if ($value -ge 1GB) { return '{0:N2} GB' -f ($value / 1GB) }
    if ($value -ge 1MB) { return '{0:N2} MB' -f ($value / 1MB) }
    if ($value -ge 1KB) { return '{0:N2} KB' -f ($value / 1KB) }
    return "$value B"
}

function Remove-TargetFolder {
    param([string]$Path, [string]$Reason, [string]$Group)

    if (Test-ProtectedPath $Path) {
        Write-Warning "跳过受保护路径: $Path"
        return [PSCustomObject]@{ Action = 'Skipped'; Path = $Path; Reason = '受保护'; Size = 0; Group = $Group }
    }
    if (-not (Test-Path -LiteralPath $Path)) {
        return [PSCustomObject]@{ Action = 'Missing'; Path = $Path; Reason = $Reason; Size = 0; Group = $Group }
    }

    $size = Get-FolderSize $Path
    $sizeText = Format-Size $size

    if (-not $ExecuteDelete) {
        Write-Host "  [预览] $Path ($sizeText)" -ForegroundColor Yellow
        Write-Host "         $Reason" -ForegroundColor DarkGray
        return [PSCustomObject]@{ Action = 'Preview'; Path = $Path; Reason = $Reason; Size = $size; Group = $Group }
    }

    if ($Force -or $PSCmdlet.ShouldProcess("$Path ($sizeText)", "删除残留文件夹", $Reason)) {
        Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        Write-Host "  已删除: $Path ($sizeText)" -ForegroundColor Green
        return [PSCustomObject]@{ Action = 'Deleted'; Path = $Path; Reason = $Reason; Size = $size; Group = $Group }
    }

    return [PSCustomObject]@{ Action = 'Cancelled'; Path = $Path; Reason = $Reason; Size = $size; Group = $Group }
}

$SafeTargets = @(
    @{ Path = (Join-UserPath 'AppData\Roaming\2345DomainMon');      Reason = '2345 推广监控残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\2345SafeCenter');     Reason = '2345 安全中心残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\360browser');         Reason = '360 浏览器残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\360huabao');          Reason = '360 壁纸残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\360Login');           Reason = '360 账号残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\360Safe');            Reason = '360 安全卫士残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\360se6');             Reason = '360 安全浏览器残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\360wp');              Reason = '360 壁纸/插件残留' }
    @{ Path = 'C:\Program Files (x86)\360';                         Reason = '360 程序目录残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\ludashi');            Reason = '鲁大师残留' }
    @{ Path = (Join-UserPath 'AppData\Local\LiebaoAI');             Reason = '猎豹浏览器 AI 残留' }
    @{ Path = (Join-UserPath 'AppData\Roaming\ksoftmgr');           Reason = '金山软件管理推广残留' }
)

$PostUninstallTargets = @(
    @{ Path = (Join-UserPath 'AppData\Roaming\kingsoft');          Reason = '金山/毒霸配置残留（请先卸载金山毒霸；保留 WPS 时慎用）' }
    @{ Path = 'C:\Program Files (x86)\kingsoft';                    Reason = '金山毒霸程序残留（请先卸载金山毒霸）' }
    @{ Path = (Join-UserPath 'AppData\Local\Lenovo');               Reason = '联想管家 Local 残留（请先卸载联想电脑管家）' }
    @{ Path = (Join-UserPath 'AppData\Roaming\Lenovo');             Reason = '联想管家 Roaming 残留（请先卸载联想电脑管家）' }
    @{ Path = (Join-UserPath 'AppData\Local\lenovoPdf');            Reason = '联想 PDF 残留（不用可删）' }
    @{ Path = 'C:\Program Files (x86)\Lenovo';                      Reason = '联想管家程序残留（请先卸载联想电脑管家）' }
)

$sysCleaner = Get-ChildItem -LiteralPath (Join-UserPath 'AppData\Local') -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like 'SysCleaner-*' }
foreach ($dir in $sysCleaner) {
    $SafeTargets += @{ Path = $dir.FullName; Reason = '清理工具临时残留' }
}

Write-Host ''
Write-Host '=== 垃圾残留清理工具 ===' -ForegroundColor Cyan
Write-Host "用户: $UserProfile"
if (-not $ExecuteDelete) {
    Write-Host '当前为预览模式。要真正删除，请加 -Confirm 或 -Force' -ForegroundColor Yellow
}
Write-Host ''

$results = [System.Collections.Generic.List[object]]::new()

Write-Host '[可直接清理]' -ForegroundColor Red
foreach ($t in $SafeTargets) {
    $results.Add((Remove-TargetFolder -Path $t.Path -Reason $t.Reason -Group '可直接清理'))
}

if ($IncludePostUninstall) {
    Write-Host ''
    Write-Host '[卸载后清理] 请确认已卸载：金山毒霸、联想电脑管家' -ForegroundColor Magenta
    foreach ($t in $PostUninstallTargets) {
        if ($t.Path -like '*Kingsoft*' -or $t.Path -like '*kingsoft*') {
            if (Test-Path -LiteralPath (Join-UserPath 'AppData\Local\Kingsoft\WPS Office')) {
                Write-Host "  跳过 $($t.Path) — 检测到 WPS 仍在使用" -ForegroundColor DarkYellow
                $results.Add([PSCustomObject]@{ Action = 'Skipped'; Path = $t.Path; Reason = 'WPS 仍在'; Size = 0; Group = '卸载后清理' })
                continue
            }
        }
        $results.Add((Remove-TargetFolder -Path $t.Path -Reason $t.Reason -Group '卸载后清理'))
    }
} else {
    Write-Host ''
    Write-Host '提示: 卸载毒霸/联想管家后，可加 -IncludePostUninstall 清理对应残留' -ForegroundColor DarkGray
}

Write-Host ''
$preview = @($results | Where-Object { $_.Action -eq 'Preview' })
$deleted = @($results | Where-Object { $_.Action -eq 'Deleted' })
$missing = @($results | Where-Object { $_.Action -eq 'Missing' })
$skipped = @($results | Where-Object { $_.Action -eq 'Skipped' })
$totalPreview = Get-SafeSum -Items $preview -Property Size
$totalDeleted = Get-SafeSum -Items $deleted -Property Size

Write-Host '--- 汇总 ---' -ForegroundColor Cyan
Write-Host "预览/将删: $($preview.Count) 项, 约 $(Format-Size $totalPreview)"
Write-Host "已删除:    $($deleted.Count) 项, 约 $(Format-Size $totalDeleted)"
Write-Host "不存在:    $($missing.Count) 项"
Write-Host "已跳过:    $($skipped.Count) 项"
Write-Host ''
Write-Host '受保护（永不删除）: Tencent、百度网盘、WPS Office、Cursor、飞书、剪映' -ForegroundColor Green

if ($preview.Count -gt 0 -and -not $ExecuteDelete) {
    Write-Host ''
    Write-Host '执行删除请运行:' -ForegroundColor Yellow
    Write-Host '  .\Clean-Residuals.ps1 -Confirm' -ForegroundColor White
}
