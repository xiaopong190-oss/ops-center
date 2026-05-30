#Requires -Version 5.1
<#
.SYNOPSIS
  扫描 C 盘用户目录与已安装程序，识别常见垃圾/捆绑软件（只读，默认不删除）
#>
[CmdletBinding()]
param(
    [switch]$ExportReport,
    [string]$UserProfile = $env:USERPROFILE
)

$ErrorActionPreference = 'SilentlyContinue'

$StrongPatterns = @(
    '2345', '360安全', '360杀毒', '360卫士', '360Chrome', '360压缩', '360壁纸', '360驱动',
    'KuaiShou', '快手', 'PPTV', 'JinShan', '金山', 'Kingsoft', '毒霸',
    '腾讯电脑管家', 'Tencent.*PC Manager', 'QQPCMgr', '电脑管家',
    '百度卫士', 'Baidu.*Antivirus', 'hao123', '搜狗.*推广',
    '迅雷.*看看', 'Xunlei', '快压', 'KuaYa', '好压', 'Haozip',
    '鲁大师', 'Ludashi', '驱动精灵', 'DriverGenius', '驱动人生',
    '快播', 'Qvod', '暴风', 'Baofeng', '布丁',
    'Toolbar', '工具栏', 'SearchProtect', 'WebDiscover', 'ByteFence',
    'Segurazo', 'OpenCandy', 'RelevantKnowledge', 'Mindspark', 'Spigot',
    'WinZip Driver Updater', 'PC Matic', 'Slimware', 'Softonic',
    'MySearch', 'Conduit', 'Babylon', 'Delta Toolbar', 'Ask Toolbar'
)

$MaybePatterns = @(
    '助手', '管家', '壁纸', '压缩', '加速', '清理大师', '优化大师',
    'Hotspot', 'WiFi万能', '爱奇艺.*助手', '优酷.*助手',
    'McAfee', 'Bonjour', 'Epic Online Services',
    'Avast Secure Browser', 'AVG Secure Browser', 'Opera.*assistant',
    '联想.*软件商店', 'Huawei.*应用市场', '应用宝'
)

$ResidualFolderPatterns = @(
    '2345', '360', 'KuaiShou', 'kuaishou', 'Kingsoft', 'JinShan', 'Tencent', 'QQPCMgr',
    'Sogou', 'Baidu', 'Xunlei', 'Thunder', 'Ludashi', 'DriverGenius', 'PPTV',
    'Baofeng', 'Qiyi', 'Youku', 'Liebao', 'Huawei', 'Lenovo', '助手', '管家', 'SoftMgr'
)

function Test-KeywordMatch {
    param([string]$Text, [string[]]$Patterns)
    if (-not $Text) { return $false }
    foreach ($p in $Patterns) {
        if ($Text -match $p) { return $true }
    }
    return $false
}

function Get-InstalledPrograms {
    $paths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    $seen = @{}
    foreach ($path in $paths) {
        Get-ItemProperty $path | Where-Object DisplayName | ForEach-Object {
            $key = "$($_.DisplayName)|$($_.DisplayVersion)"
            if ($seen.ContainsKey($key)) { return }
            $seen[$key] = $true
            [PSCustomObject]@{
                DisplayName     = $_.DisplayName
                Publisher       = $_.Publisher
                UninstallString = $_.UninstallString
                InstallDate     = $_.InstallDate
                DisplayVersion  = $_.DisplayVersion
                Source          = if ($path -like 'HKCU*') { 'HKCU' } elseif ($path -like '*WOW6432*') { 'HKLM-WOW64' } else { 'HKLM' }
            }
        }
    }
}

function Get-AppCategory {
    param($Entry)
    $blob = "$($Entry.DisplayName) $($Entry.Publisher)"
    if (Test-KeywordMatch $blob $StrongPatterns) {
        return @{ Category = '强烈建议卸载'; Reason = '命中常见捆绑/工具栏/国产安全类垃圾关键词' }
    }
    if (Test-KeywordMatch $blob $MaybePatterns) {
        return @{ Category = '可能垃圾'; Reason = '命中助手/管家/壁纸/压缩等可疑关键词' }
    }
    if (-not $Entry.Publisher -or $Entry.Publisher -match '^(Unknown|)$') {
        if ($Entry.DisplayName -match 'Setup|Update|Helper|Service|Toolbar|Extension') {
            return @{ Category = '可能垃圾'; Reason = '缺少可信发布者且名称像辅助/推广组件' }
        }
    }
    if ($Entry.InstallDate -match '^\d{8}$') {
        try {
            $d = [datetime]::ParseExact($Entry.InstallDate, 'yyyyMMdd', $null)
            $trusted = 'Microsoft|Intel|NVIDIA|AMD|Python|Git|Visual Studio|Office|Adobe|Chrome|Firefox|Edge|Steam|Discord|Zoom|Slack|Docker|Node|Java|\.NET|Cursor|VS Code'
            if ($d -lt (Get-Date).AddYears(-8) -and $Entry.DisplayName -notmatch $trusted) {
                return @{ Category = '可能垃圾'; Reason = "安装日期较旧 ($($d.ToString('yyyy-MM-dd')))，且非常见开发/系统组件" }
            }
        } catch {}
    }
    return @{ Category = '正常软件'; Reason = '未命中垃圾规则' }
}

function Get-ScanDirectories {
    param([string]$Profile)
    @(
        Join-Path $Profile 'AppData\Local'
        Join-Path $Profile 'AppData\Roaming'
        Join-Path $Profile 'Downloads'
        'C:\Program Files'
        'C:\Program Files (x86)'
    )
}

Write-Host ''
Write-Host '=== C 盘垃圾软件扫描（只读）===' -ForegroundColor Cyan
Write-Host "用户目录: $UserProfile"
Write-Host ''

$apps = @(Get-InstalledPrograms | Sort-Object DisplayName)
$installedBlob = ($apps | ForEach-Object { $_.DisplayName }) -join '|'

$results = [ordered]@{
    '强烈建议卸载' = [System.Collections.Generic.List[object]]::new()
    '可能垃圾'     = [System.Collections.Generic.List[object]]::new()
    '残留文件夹'   = [System.Collections.Generic.List[object]]::new()
}

foreach ($app in $apps) {
    $info = Get-AppCategory $app
    if ($info.Category -eq '正常软件') { continue }
    $results[$info.Category].Add([PSCustomObject]@{
        名称           = $app.DisplayName
        发布者         = $app.Publisher
        版本           = $app.DisplayVersion
        路径或卸载命令 = if ($app.UninstallString) { $app.UninstallString } else { "(无卸载命令, 来源: $($app.Source))" }
        原因           = $info.Reason
    })
}

foreach ($dir in (Get-ScanDirectories $UserProfile)) {
    if (-not (Test-Path -LiteralPath $dir)) { continue }
    Get-ChildItem -LiteralPath $dir -Force | ForEach-Object {
        $name = $_.Name
        if (-not (Test-KeywordMatch $name $ResidualFolderPatterns)) { return }

        $linked = $false
        foreach ($n in ($installedBlob -split '\|')) {
            if ($n -and ($n -like "*$name*" -or $name -like "*$n*")) {
                $linked = $true
                break
            }
        }

        if (-not $linked -or (Test-KeywordMatch $name $StrongPatterns)) {
            $results['残留文件夹'].Add([PSCustomObject]@{
                名称           = $name
                发布者         = '-'
                版本           = '-'
                路径或卸载命令 = $_.FullName
                原因           = '用户/Program Files 顶层目录命中垃圾常见名，可能为卸载后残留'
            })
        }
    }
}

foreach ($cat in @('强烈建议卸载', '可能垃圾', '残留文件夹')) {
    $items = $results[$cat]
    $color = switch ($cat) {
        '强烈建议卸载' { 'Red' }
        '可能垃圾'     { 'Yellow' }
        default        { 'Magenta' }
    }
    Write-Host "[$cat] 共 $($items.Count) 项" -ForegroundColor $color
    if ($items.Count -eq 0) {
        Write-Host '  （无）'
    } else {
        $items | ForEach-Object {
            Write-Host "  - $($_.名称)" -ForegroundColor $color
            Write-Host "    路径/卸载: $($_.路径或卸载命令)"
            Write-Host "    原因: $($_.原因)"
        }
    }
    Write-Host ''
}

Write-Host "已安装程序总数: $($apps.Count)（未列出的视为正常软件）" -ForegroundColor Green
Write-Host ''
Write-Host '说明: 这是规则匹配结果，不是 100% 准确。卸载前请确认是否还在使用。' -ForegroundColor DarkGray
Write-Host '卸载建议: 设置 -> 应用 -> 已安装的应用，或使用上面显示的 UninstallString。' -ForegroundColor DarkGray

if ($ExportReport) {
    $report = Join-Path $env:USERPROFILE 'Desktop\junk-scan-report.md'
    $csv = Join-Path $env:USERPROFILE 'Desktop\junk-scan-uninstall.csv'

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('# 垃圾软件扫描报告')
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine("- 时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
    [void]$sb.AppendLine("- 用户: $UserProfile")
    [void]$sb.AppendLine('')

    foreach ($cat in @('强烈建议卸载', '可能垃圾', '残留文件夹')) {
        [void]$sb.AppendLine("## $cat ($($results[$cat].Count))")
        foreach ($item in $results[$cat]) {
            [void]$sb.AppendLine("- **$($item.名称)**")
            [void]$sb.AppendLine("  - 路径/卸载: $($item.路径或卸载命令)")
            [void]$sb.AppendLine("  - 原因: $($item.原因)")
        }
        [void]$sb.AppendLine('')
    }

    $sb.ToString() | Out-File -FilePath $report -Encoding utf8
    $apps | Export-Csv -NoTypeInformation -Encoding UTF8 $csv
    Write-Host "报告已保存: $report"
    Write-Host "完整列表:   $csv"
}
