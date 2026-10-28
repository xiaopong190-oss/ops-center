param([switch]$NoBrowser, [ValidateRange(1024,65535)][int]$Port = 4318)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')
$server = Join-Path $root 'tools\logistics-workspace\dev-server.cjs'
$supervisor = Join-Path $root 'tools\logistics-workspace\portable-supervisor.cjs'
if (-not (Test-Path -LiteralPath (Join-Path $root 'bin\node.exe')) -or -not (Test-Path -LiteralPath $server)) { throw '请先把补丁内全部文件复制到原航序文件夹，替换同名文件，再运行本文件。' }
$processes = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and ($_.CommandLine.IndexOf($server,[StringComparison]::OrdinalIgnoreCase) -ge 0 -or $_.CommandLine.IndexOf($supervisor,[StringComparison]::OrdinalIgnoreCase) -ge 0)
})
# Stop only application scripts in this exact installed folder; never use port-based killing.
foreach ($item in @($processes | Where-Object { $_.CommandLine.IndexOf($supervisor,[StringComparison]::OrdinalIgnoreCase) -ge 0 })) { Stop-Process -Id $item.ProcessId -ErrorAction Stop }
foreach ($item in @($processes | Where-Object { $_.CommandLine.IndexOf($server,[StringComparison]::OrdinalIgnoreCase) -ge 0 })) { if (Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue) { Stop-Process -Id $item.ProcessId -ErrorAction Stop } }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root '启动航序.ps1') -NoBrowser -Port $Port
if ($LASTEXITCODE) { throw '重启未完成，请查看 logs/startup.log；不要清除浏览器数据。' }
if (-not $NoBrowser) { Start-Process ('http://127.0.0.1:'+$Port+'/input') }
Write-Host '新版程序已启动。请在原浏览器刷新输入端；业务数据未修改。'
