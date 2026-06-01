# Deploy cloud-17 to GitHub Pages
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$log = Join-Path $root "_push-log.txt"
"" | Set-Content $log -Encoding utf8
function Log($s) { $line = "[$(Get-Date -Format 'HH:mm:ss')] $s"; Write-Host $line; Add-Content $log $line }

Log "DEPLOY cloud-17 start"

Log "sync-browser.mjs"
& node sync-browser.mjs 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) { Log "FAIL sync-browser"; Read-Host "Press Enter"; exit 1 }

Log "build-browser-bundle.mjs"
& node deploy/build-browser-bundle.mjs 2>&1 | ForEach-Object { Log $_ }

if (Test-Path "app.bundle.js") {
  $txt = Get-Content "app.bundle.js" -Raw
  if ($txt -notmatch "cloud-17") { Log "WARN: bundle missing cloud-17 (Pages will use runtime jsx)" }
  if ($txt -match "key: configVersion") { Log "WARN: bundle still has configVersion" }
}

Log "git fetch origin"
& git fetch origin 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -eq 0) {
  Log "git reset --soft origin/main"
  & git reset --soft origin/main 2>&1 | ForEach-Object { Log $_ }
}
git cat-file -e "origin/main:amazon-news.json" 2>$null
if ($LASTEXITCODE -eq 0) {
  & git checkout origin/main -- amazon-news.json 2>&1 | ForEach-Object { Log $_ }
}

& git add src app.html deploy .github sync-browser.mjs package-lock.json fx-rates.json tools local-tools packages CHECK-VERSION.bat DEPLOY-NOW.bat DEPLOY-NOW.ps1 2>&1 | ForEach-Object { Log $_ }
if (Test-Path "app.bundle.js") { & git add -f app.bundle.js 2>&1 | ForEach-Object { Log $_ } }
Get-ChildItem -Path $root -Filter "*.bat" | ForEach-Object { & git add $_.FullName 2>&1 | Out-Null }

& git status -sb 2>&1 | ForEach-Object { Log $_ }

$staged = @(git diff --cached --name-only 2>$null)
if ($staged.Count -gt 0) {
  & git commit -m "fix: cloud-17 — refresh button and active-tab cloud sync only" 2>&1 | ForEach-Object { Log $_ }
} else {
  Log "nothing new to commit"
}

Log "git push origin main"
$pushOk = $false
for ($attempt = 1; $attempt -le 5; $attempt++) {
  if ($attempt -gt 1) { Log "push retry $attempt/5 in 8s..."; Start-Sleep -Seconds 8 }
  & git push origin main 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -eq 0) { $pushOk = $true; break }
}
if (-not $pushOk) {
  Log "PUSH FAILED — try VPN / hotspot / GitHub Desktop"
  Read-Host "Press Enter"
  exit 1
}

Log "DONE OK — wait 1-2 min, Ctrl+F5, look for cloud-17"
Read-Host "Press Enter"
exit 0
