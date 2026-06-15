# Push FBA Hanhai converter to GitHub (xiaopong190-oss/ops-center main)
# If push fails, enable proxy first:
#   $env:HTTPS_PROXY = "http://127.0.0.1:7890"
#   $env:HTTP_PROXY  = "http://127.0.0.1:7890"

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "_push-fba-result.txt"
"" | Set-Content $log -Encoding UTF8

function Log($msg) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
  Add-Content $log $line -Encoding UTF8
  Write-Output $line
}

try {
  Log "remote:"
  git remote -v 2>&1 | ForEach-Object { Log $_ }

  Log "status before:"
  git status -sb 2>&1 | ForEach-Object { Log $_ }

  git add tools/fba-hanhai-converter/ src/ToolsModule.jsx src/ToolsModule.browser.jsx
  Log "staged fba-hanhai + ToolsModule"

  $porcelain = git diff --cached --name-only
  if ($porcelain) {
    git commit -m @"
feat(tools): FBA Hanhai converter with Lingxing SKU database

- Import/export Lingxing SKU library (CSV/XLS/JSON), auto-match on FBA CSV
- Manual declare price/material save to local SKU DB
- Multi-SKU, warehouse fixes, no ASIN/FNSKU/SKU in export XLS
"@
    Log "commit: $(git log -1 --oneline)"
  } else {
    Log "nothing new to commit (already committed)"
    Log "latest: $(git log -1 --oneline)"
  }

  $ahead = git rev-list --count origin/main..HEAD 2>$null
  Log "commits ahead of origin/main: $ahead"

  if ([int]$ahead -gt 0) {
    git push origin main 2>&1 | ForEach-Object { Log $_ }
    if ($LASTEXITCODE -ne 0) { throw "git push failed exit $LASTEXITCODE" }
    Log "PUSH OK"
  } else {
    Log "already up to date with origin/main"
  }

  Log "status after:"
  git status -sb 2>&1 | ForEach-Object { Log $_ }
  Log "DONE"
} catch {
  Log "ERROR: $_"
  exit 1
}
