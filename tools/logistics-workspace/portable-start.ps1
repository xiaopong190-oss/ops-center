param([switch]$NoBrowser, [ValidateRange(1024,65535)][int]$Port = 4318)
$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$nodeFile = Join-Path $bundleRoot 'bin\node.exe'
$serverFile = Join-Path $bundleRoot 'tools\logistics-workspace\portable-supervisor.cjs'
$logFolder = Join-Path $bundleRoot 'logs'
$mutex = New-Object System.Threading.Mutex($false, ('Local\HangxuInputStartup'+$Port))
try { $acquired = $mutex.WaitOne(15000) } catch [System.Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired) { $mutex.Dispose(); throw '另一个启动检查正在运行，请稍候重试。' }
function Test-Hangxu {
    try {
        $request = [System.Net.HttpWebRequest]::Create(('http://127.0.0.1:'+$Port+'/health'))
        $request.Proxy = $null
        $request.Timeout = 1500
        $response = $request.GetResponse()
        try { $reader = New-Object System.IO.StreamReader($response.GetResponseStream()); $health = $reader.ReadToEnd() | ConvertFrom-Json; return $health.app -eq 'hangxu-input' } finally { $response.Close() }
    } catch { return $false }
}
try {
$ready = $false
$ready = Test-Hangxu
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
