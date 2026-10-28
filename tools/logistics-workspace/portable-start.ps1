param([switch]$NoBrowser, [ValidateRange(1024,65535)][int]$Port = 4318)
$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
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
try {
$ready = $false
$ready = Test-Hangxu
if (-not $ready -and $script:staleService) {
    # Replace only processes whose command line names this exact installation.
    # An old installation in another folder is never killed based on its port.
    $ownScripts = @($serverFile, (Join-Path $bundleRoot 'tools\logistics-workspace\dev-server.cjs'))
    foreach ($ownScript in $ownScripts) {
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($ownScript,[StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    }
    Start-Sleep -Milliseconds 350
    $script:staleService = $false
    $ready = Test-Hangxu
    if (-not $ready -and $script:staleService) { throw '4318仍由另一文件夹的旧版航序占用。请回到原来启动航序的文件夹覆盖补丁并运行“更新后启动.cmd”；不要另开端口或清除浏览器数据。' }
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
if (-not $ready) { throw ('无法启动。请查看 '+$logFolder+'\startup.log；4318端口若被其他程序占用，需要先处理占用。不要清除浏览器数据。') }
if (-not $NoBrowser) { Start-Process ('http://127.0.0.1:'+$Port+'/input') }
} finally { $mutex.ReleaseMutex(); $mutex.Dispose() }
