$ErrorActionPreference = 'Stop'
$bundleRoot = $PSScriptRoot
$nodeFile = Join-Path $bundleRoot 'bin\node.exe'
$serverFile = Join-Path $bundleRoot 'tools\logistics-workspace\dev-server.cjs'
$ready = $false
try { $health = Invoke-RestMethod 'http://127.0.0.1:4318/health' -TimeoutSec 3; $ready = $health.app -eq 'hangxu-input' } catch {}
if (-not $ready) {
    if (-not (Test-Path -LiteralPath $nodeFile)) { throw '请先完整解压压缩包，再运行启动文件。' }
    Start-Process -FilePath $nodeFile -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $bundleRoot -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 250
        try { $health = Invoke-RestMethod 'http://127.0.0.1:4318/health' -TimeoutSec 2; $ready = $health.app -eq 'hangxu-input'; if ($ready) { break } } catch {}
    }
}
if (-not $ready) { throw '无法启动：4318端口可能被其他程序占用。请关闭已有航序服务后重试。' }
Start-Process 'http://127.0.0.1:4318/login'
