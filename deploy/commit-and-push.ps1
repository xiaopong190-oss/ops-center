$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$log = Join-Path $root "_push-result.txt"
$script:DidStash = $false
"" | Set-Content -LiteralPath $log -Encoding UTF8

function Log($msg) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

function ExitCode {
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne "") { return [int]$LASTEXITCODE }
  if ($?) { return 0 }
  return 1
}

function Stash-IfDirty {
  if (-not (git status --porcelain 2>$null)) { return }
  Log "stashing uncommitted files before rebase..."
  git stash push -u -m "ops-commit-push-temp" 2>&1 | ForEach-Object { Log $_ }
  if ((ExitCode) -ne 0) { exit 1 }
  $script:DidStash = $true
}

function Restore-Stash {
  if (-not $script:DidStash) { return }
  Log "git stash pop"
  git stash pop 2>&1 | ForEach-Object { Log $_ }
  $script:DidStash = $false
}

Log "commit-and-push start"
Log (git status -sb 2>&1 | Out-String).Trim()

git add app.html sync-browser.mjs serve-open.ps1 deploy/build-browser-bundle.mjs deploy/verify-browser-boot.mjs deploy/commit-and-push.ps1 打开界面.html 修复主界面.bat
git add src/GlobalCloudSync.browser.jsx src/KpiModule.browser.jsx
git add -u src/*.browser.jsx 2>$null

foreach ($secret in @(
  "gist-config.local.js",
  "gist-secrets.local.json",
  "src/cloud-sync-config.secret.js",
  ".env",
  "push_result.txt",
  "_push-result.txt",
  "_do-git-push.ps1"
)) {
  git reset HEAD $secret 2>$null | Out-Null
}

Log "staged:"
git diff --cached --stat 2>&1 | ForEach-Object { Log $_ }

if (git diff --cached --quiet 2>$null) {
  Log "nothing staged to commit"
} else {
  git commit -m @"
Fix browser boot import error and improve app loading

- Strip residual import statements from browser jsx modules
- Strengthen module syntax cleanup in app.html and bundle build
- Prefer precompiled bundle with GlobalCloudSync included
- Disable cache for local dev server and add repair script
"@ 2>&1 | ForEach-Object { Log $_ }
  if ((ExitCode) -ne 0) { exit 1 }
}

Log "git fetch origin"
git fetch origin 2>&1 | ForEach-Object { Log $_ }

Stash-IfDirty

$behind = git rev-list --count HEAD..origin/main 2>$null
if ($behind -match '^\d+$' -and [int]$behind -gt 0) {
  Log "remote ahead by $behind; git pull --rebase origin main"
  git pull --rebase origin main 2>&1 | ForEach-Object { Log $_ }
  if ((ExitCode) -ne 0) {
    Restore-Stash
    Log "rebase failed — resolve conflicts then: git rebase --continue && git push origin main"
    exit 1
  }
}

Log "git push origin main"
git push origin main 2>&1 | ForEach-Object { Log $_ }
if ((ExitCode) -ne 0) {
  Restore-Stash
  exit 1
}

Restore-Stash
Log "done OK — $(git log -1 --oneline)"
Log "Pages: https://xiaopong190-oss.github.io/ops-center/"
exit 0
