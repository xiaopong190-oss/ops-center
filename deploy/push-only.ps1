$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $root "_push-result.txt"
$script:DidStash = $false

function Log($msg) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

function Get-ExitCodeHelper {
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne "") { return [int]$LASTEXITCODE }
  if ($?) { return 0 }
  return 1
}

function Stash-IfDirty {
  if (-not (git status --porcelain 2>$null)) { return }
  Log "stashing uncommitted files before rebase..."
  git stash push -u -m "ops-push-temp" 2>&1 | ForEach-Object { Log $_ }
  if ((Get-ExitCodeHelper) -ne 0) { exit 1 }
  $script:DidStash = $true
}

function Restore-Stash {
  if (-not $script:DidStash) { return }
  Log "git stash pop"
  git stash pop 2>&1 | ForEach-Object { Log $_ }
  $script:DidStash = $false
}

Log "push-only start"
Log "git fetch origin"
git fetch origin 2>&1 | ForEach-Object { Log $_ }

Stash-IfDirty

$behind = git rev-list --count HEAD..origin/main 2>$null
if ($behind -match '^\d+$' -and [int]$behind -gt 0) {
  Log "remote is $behind commit(s) ahead; git pull --rebase origin main"
  git pull --rebase origin main 2>&1 | ForEach-Object { Log $_ }
  if ((Get-ExitCodeHelper) -ne 0) { Restore-Stash; exit 1 }
}

$ahead = git rev-list --count origin/main..HEAD 2>$null
Log "commits ahead of origin/main: $ahead"

Log "git push origin main"
$ErrorActionPreference = "Continue"
$pushLines = git push origin main 2>&1 | ForEach-Object { "$_" }
$ErrorActionPreference = "Stop"
foreach ($line in $pushLines) { Log $line }

$pushCode = Get-ExitCodeHelper
if ($pushCode -ne 0) {
  Restore-Stash
  Log "PUSH FAILED (exit $pushCode)."
  exit 1
}

Restore-Stash
Log "push-only done OK"
Log "Wait 1-2 min, Ctrl+F5: https://xiaopong190-oss.github.io/ops-center/"
exit 0
