$ErrorActionPreference = "Stop"
$proj = Split-Path -Parent $PSScriptRoot
$packages = Join-Path $proj "packages"
$zip = Join-Path $packages "mailwatch-win.zip"

$mailwatch = Join-Path (Split-Path $proj -Parent) "mailwatch"
if (-not (Test-Path -LiteralPath $mailwatch)) {
  Write-Warning "MailWatch source not found: $mailwatch (skip zip)"
  exit 0
}

New-Item -ItemType Directory -Force -Path $packages | Out-Null
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }

$staging = Join-Path $env:TEMP ("mailwatch-pack-" + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $staging | Out-Null

$exclude = @("__pycache__", ".env", "start.log", "install.log", ".git")
Get-ChildItem -LiteralPath $mailwatch -Force | ForEach-Object {
  if ($exclude -contains $_.Name) { return }
  Copy-Item -LiteralPath $_.FullName -Destination $staging -Recurse -Force
}

if (-not (Test-Path -LiteralPath (Join-Path $staging ".env.example"))) {
  Write-Warning "mailwatch .env.example missing"
}

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zip -Force
Remove-Item -LiteralPath $staging -Recurse -Force

Write-Host "Packed: $zip ($((Get-Item $zip).Length) bytes)"
