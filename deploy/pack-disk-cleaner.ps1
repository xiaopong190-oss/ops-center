$ErrorActionPreference = "Stop"
$proj = Split-Path -Parent $PSScriptRoot
$src = Join-Path $proj "local-tools\disk-cleaner"
$packages = Join-Path $proj "packages"
$zip = Join-Path $packages "disk-cleaner-win.zip"

if (-not (Test-Path -LiteralPath $src)) {
  Write-Error "Source not found: $src"
}

New-Item -ItemType Directory -Force -Path $packages | Out-Null
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

$staging = Join-Path $env:TEMP ("disk-cleaner-pack-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $staging | Out-Null
Copy-Item -Path (Join-Path $src "*") -Destination $staging -Recurse -Force
Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zip -Force
Remove-Item -LiteralPath $staging -Recurse -Force

Write-Host "Packed: $zip ($((Get-Item $zip).Length) bytes)"
