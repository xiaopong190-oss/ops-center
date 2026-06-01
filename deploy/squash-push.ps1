# Squash local commits and push to GitHub
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:GIT_EDITOR = "true"
$env:GIT_HTTP_VERSION = "HTTP/1.1"

function Log($m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" }

function Git-Retry($label, [string[]]$GitArgs, [int]$Tries = 5) {
  for ($i = 1; $i -le $Tries; $i++) {
    Log "$label (try $i/$Tries)"
    & git @GitArgs 2>&1 | ForEach-Object { Write-Host $_; $_ }
    if ($LASTEXITCODE -eq 0) { return $true }
    if ($i -lt $Tries) {
      $wait = $i * 5
      Log "network error, wait ${wait}s and retry..."
      Start-Sleep -Seconds $wait
    }
  }
  return $false
}

Log "squash-push start"

if (Test-Path ".git/rebase-merge") {
  Log "git rebase --abort"
  & git rebase --abort
}

Log "node sync-browser.mjs"
& node sync-browser.mjs
if ($LASTEXITCODE -ne 0) { Log "FAIL sync-browser"; exit 1 }

Log "node deploy/build-browser-bundle.mjs"
& node deploy/build-browser-bundle.mjs

$fetchOk = Git-Retry "git fetch origin" @("fetch", "origin")
if (-not $fetchOk) {
  if (Test-Path ".git/refs/remotes/origin/main") {
    Log "WARN: fetch failed - using last cached origin/main"
  } else {
    Log "FAIL fetch (no network and no cached origin/main)"
    Log "Check VPN/proxy, open https://github.com in browser, then retry PUSH.bat"
    exit 1
  }
}

Log "git reset --soft origin/main"
& git reset --soft origin/main

Log "git checkout origin/main -- amazon-news.json"
& git checkout origin/main -- amazon-news.json

Log "git add files"
& git add src app.html deploy sync-browser.mjs rebuild-bundle.bat run.bat serve-open.ps1 fx-rates.json .gitignore tools local-tools packages
if (Test-Path "app.bundle.js") { & git add -f app.bundle.js }
Get-ChildItem -Path $root -Filter "*.bat" | ForEach-Object { & git add $_.FullName }

$staged = & git diff --cached --name-only
if ($staged) {
  Log "git commit"
  & git commit -m "fix: JSONBin cloud sync and cloud-8 status bar for GitHub Pages"
  if ($LASTEXITCODE -ne 0) { Log "FAIL commit"; exit 1 }
} else {
  Log "nothing new to commit"
}

$pushOk = Git-Retry "git push origin main" @("push", "origin", "main")
if (-not $pushOk) {
  Log "FAIL push - network blocked to GitHub"
  Log "Try: VPN on, or GitHub Desktop, or phone hotspot"
  Log "Then run PUSH.bat again (commit already done, will push only)"
  exit 1
}

Log "DONE OK"
Log "Wait 1-2 min, Ctrl+F5: https://xiaopong190-oss.github.io/ops-center/"
Log "Look for cloud-8 badge top-left"
exit 0
