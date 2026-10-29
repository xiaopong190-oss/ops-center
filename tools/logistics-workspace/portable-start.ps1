param([switch]$NoBrowser, [switch]$SkipUpdate, [ValidateRange(1024,65535)][int]$Port = 4318)
$ErrorActionPreference = 'Stop'
$bundleRoot = if ((Split-Path $PSScriptRoot -Leaf) -eq 'bin') { Split-Path $PSScriptRoot -Parent } else { $PSScriptRoot }
$nodeFile = Join-Path $bundleRoot 'bin\node.exe'
$serverFile = Join-Path $bundleRoot 'tools\logistics-workspace\portable-supervisor.cjs'
$logFolder = Join-Path $bundleRoot 'logs'
$expectedVersion = (Get-Content -LiteralPath (Join-Path $bundleRoot 'tools\logistics-workspace\package.json') -Raw | ConvertFrom-Json).version
$script:staleService = $false
$mutex = New-Object System.Threading.Mutex($false, ('Local\HangxuInputStartup'+$Port))
try { $acquired = $mutex.WaitOne(15000) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired) { $mutex.Dispose(); throw '另一个启动检查正在运行，请稍候重试。' }
function Test-Hangxu {
    try {
        $request = [System.Net.HttpWebRequest]::Create(('http://127.0.0.1:'+$Port+'/health'))
        $request.Proxy = $null
        $request.Timeout = 1500
        $response = $request.GetResponse()
        try { $reader = New-Object System.IO.StreamReader($response.GetResponseStream()); $health = $reader.ReadToEnd() | ConvertFrom-Json; if ($health.app -eq 'hangxu-input') { $current = $health.version -eq $expectedVersion -and $health.snapshotRelay -eq 'chunks-v1'; if (-not $current) { $script:staleService = $true }; return $current }; return $false } finally { $response.Close() }
    } catch { return $false }
}
function Stop-VerifiedHangxuProcess {
    param([int]$ProcessId)
    # The verified process can exit with its guardian between inspection and stop.
    try { Stop-Process -Id $ProcessId -ErrorAction Stop }
    catch {
        if ($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId,*') { throw }
    }
}
try {
$updater = Join-Path $bundleRoot 'tools\logistics-workspace\portable-auto-update.cjs'
if (-not $SkipUpdate -and (Test-Path -LiteralPath $updater)) {
    $env:LOGISTICS_UI_PORT = [string]$Port
    Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
    & $nodeFile $updater
    $updateApplied = $LASTEXITCODE -eq 3
    if ($LASTEXITCODE -eq 2) { throw '更新恢复尚未完成，已阻止启动混合版本。请保留原目录并联系管理员。' }
    $updatedVersion = (Get-Content -LiteralPath (Join-Path $bundleRoot 'tools\logistics-workspace\package.json') -Raw | ConvertFrom-Json).version
    if ($updateApplied -or $updatedVersion -ne $expectedVersion) {
        # Release the startup lock before entering the verified new launcher.
        $mutex.ReleaseMutex(); $mutex.Dispose(); $mutex = $null
        $restartArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $bundleRoot 'bin\launcher.ps1'),'-SkipUpdate','-Port',[string]$Port)
        if ($NoBrowser) { $restartArgs += '-NoBrowser' }
        & powershell.exe @restartArgs
        if ($LASTEXITCODE) {
            & $nodeFile $updater --rollback
            if ($LASTEXITCODE) { throw '自动更新恢复未完成，请保留原目录并联系管理员。' }
            Write-Host '新版启动失败，已恢复原版，正在重新启动。'
            & powershell.exe @restartArgs
            if ($LASTEXITCODE) { throw '原版启动未完成，请查看 logs/startup.log。' }
        } else { & $nodeFile $updater --confirm }
        return
    }
}
$ready = $false
$ready = Test-Hangxu
if (-not $ready -and $script:staleService) {
    # Verify the actual listening process, installation marker and bundled runtime.
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -First 1
    if (-not $connection) { throw '找不到本机航序监听进程，未关闭其他程序。请查看启动日志。' }
    $ownerProcess = Get-CimInstance Win32_Process -Filter ("ProcessId="+$connection.OwningProcess)
    $suffix = '\tools\logistics-workspace\dev-server.cjs'
    $command = [string]$ownerProcess.CommandLine
    $offset = $command.IndexOf($suffix,[StringComparison]::OrdinalIgnoreCase)
    if ($offset -lt 0 -or -not $ownerProcess.ExecutablePath) { throw '端口进程不是可验证的航序程序，未关闭任何进程。' }
    $oldRoot = Split-Path (Split-Path $ownerProcess.ExecutablePath -Parent) -Parent
    $oldServer = Join-Path $oldRoot 'tools\logistics-workspace\dev-server.cjs'
    $oldSupervisor = Join-Path $oldRoot 'tools\logistics-workspace\portable-supervisor.cjs'
    $oldNode = Join-Path $oldRoot 'bin\node.exe'
    if (-not [string]::Equals($ownerProcess.ExecutablePath,$oldNode,[StringComparison]::OrdinalIgnoreCase) -or $command.IndexOf($oldServer,[StringComparison]::OrdinalIgnoreCase) -lt 0 -or -not (Test-Path -LiteralPath (Join-Path $oldRoot 'tools\logistics-workspace\package.json'))) { throw '无法验证旧航序目录，未关闭其他程序。' }
    Write-Host ('正在从旧航序切换：'+$oldRoot)
    $candidates = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.ExecutablePath -and [string]::Equals($_.ExecutablePath,$oldNode,[StringComparison]::OrdinalIgnoreCase) -and $_.CommandLine })
    foreach ($candidate in @($candidates | Where-Object { $_.CommandLine.IndexOf($oldSupervisor,[StringComparison]::OrdinalIgnoreCase) -ge 0 })) { Stop-VerifiedHangxuProcess -ProcessId $candidate.ProcessId }
    Stop-VerifiedHangxuProcess -ProcessId $ownerProcess.ProcessId
    Start-Sleep -Milliseconds 500
    $script:staleService = $false
    $ready = Test-Hangxu
    if (-not $ready -and $script:staleService) { throw '旧服务仍占用端口，未能切换；请查看启动日志。' }

}
if (-not $ready) {
    if (-not (Test-Path -LiteralPath $nodeFile)) { throw '请先完整解压压缩包，再运行启动文件。' }
    if (-not (Test-Path -LiteralPath $serverFile)) { throw '启动文件缺失，请重新完整解压新版安装包。' }
    New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $nodeFile
    $startInfo.Arguments = '"' + $serverFile + '"'
    $startInfo.WorkingDirectory = $bundleRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $startInfo.EnvironmentVariables['LOGISTICS_UI_PORT'] = [string]$Port
    $startInfo.EnvironmentVariables.Remove('NODE_OPTIONS')
    $service = [System.Diagnostics.Process]::Start($startInfo)
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 250
        $ready = Test-Hangxu
        if ($ready -or $service.HasExited) { break }
    }
}
if (-not $ready) {
    # Only stop the guardian and child tree created by this exact launch attempt.
    if ($service -and -not $service.HasExited) { & taskkill.exe /PID $service.Id /T /F | Out-Null }
    throw ('无法启动。请查看 '+$logFolder+'\startup.log；4318端口若被其他程序占用，需要先处理占用。不要清除浏览器数据。')
}
if (-not $NoBrowser) { Start-Process ('http://127.0.0.1:'+$Port+'/input') }
} finally { if ($mutex) { $mutex.ReleaseMutex(); $mutex.Dispose() } }
