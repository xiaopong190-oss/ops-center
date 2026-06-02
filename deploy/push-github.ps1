# 推送到 GitHub（纯 cmd 调用 git，避免 PowerShell 坑）
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $root "_push-result.txt"
$env:GIT_EDITOR = "true"

function Log($msg) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

function Exec($cmd) {
  Log $cmd
  cmd /c $cmd 2>&1 | ForEach-Object { Log $_; Write-Host $_ }
  return $LASTEXITCODE
}

"" | Set-Content -LiteralPath $log -Encoding UTF8
Log "push-github start"

Exec "node sync-browser.mjs" | Out-Null
Exec "node deploy\build-browser-bundle.mjs" | Out-Null

Exec "git fetch origin" | Out-Null
Exec "git checkout origin/main -- amazon-news.json" | Out-Null

$porcelain = cmd /c "git status --porcelain"
if ($porcelain) {
  Exec "git add src app.html deploy rebuild-bundle.bat run.bat serve-open.ps1 fx-rates.json .gitignore tools local-tools packages sync-browser.mjs app.bundle.js" | Out-Null
  Exec "git commit -m ""fix: JSONBin cloud sync cloud-8""" | Out-Null
}

$dirty = cmd /c "git status --porcelain"
if ($dirty) {
  Exec "git stash push -u -m ops-push-temp" | Out-Null
}

Exec "git pull --rebase origin main" | Out-Null
if (Test-Path ".git\rebase-merge") {
  Exec "git checkout --ours amazon-news.json" | Out-Null
  Exec "git add amazon-news.json" | Out-Null
  Exec "git rebase --continue" | Out-Null
}

$pushCode = Exec "git push origin main"
if ($pushCode -ne 0) {
  Log "FAILED - try 完成推送.bat"
  exit 1
}

Exec "git stash pop" | Out-Null
Log "push-github done OK"
Log "https://xiaopong190-oss.github.io/ops-center/"
exit 0
