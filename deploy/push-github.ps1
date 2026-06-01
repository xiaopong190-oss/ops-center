# 打包 + 提交 + 推送到 GitHub（非交互，可在终端直接运行）
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

function Get-ExitCode {
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne "") { return [int]$LASTEXITCODE }
  if ($?) { return 0 }
  return 1
}

function Run-Logged($label, [scriptblock]$Block, [switch]$AllowFail) {
  Log $label
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $lines = @()
  try {
    & $Block 2>&1 | ForEach-Object {
      $t = "$_"
      $lines += $t
      Add-Content -LiteralPath $log -Value $t -Encoding UTF8
    }
  } finally {
    $ErrorActionPreference = $prev
  }
  $code = Get-ExitCode
  if ($code -ne 0 -and -not $AllowFail) {
    $detail = ($lines | Select-Object -Last 8) -join " | "
    throw "${label} failed (exit ${code}): ${detail}"
  }
  return $code
}

function Step($label, [scriptblock]$Block, [switch]$AllowFail) {
  Run-Logged $label $Block -AllowFail:$AllowFail | Out-Null
}

function Stash-IfDirty {
  $dirty = git status --porcelain 2>$null
  if (-not $dirty) { return }
  Log "stashing uncommitted files before rebase..."
  Step "git stash push" { git stash push -u -m "ops-push-temp" }
  $script:DidStash = $true
}

function Restore-Stash {
  if (-not $script:DidStash) { return }
  Step "git stash pop" { git stash pop } -AllowFail
  $script:DidStash = $false
}

"" | Set-Content -LiteralPath $log -Encoding UTF8
Log "push-github start"

try {
  Step "pack disk-cleaner" { & "$PSScriptRoot\pack-disk-cleaner.ps1" } -AllowFail
  Step "sync browser" { node sync-browser.mjs }

  $bundleCode = Run-Logged "build app.bundle.js" { node deploy/build-browser-bundle.mjs } -AllowFail
  if ($bundleCode -ne 0) {
    Log "WARN: bundle build failed; push continues (Pages uses runtime .browser.jsx)"
  }

  Step "git status" { git status }

  $changes = git status --porcelain
  if ($changes) {
    Step "git add" {
      git add src app.html deploy rebuild-bundle.bat run.bat launch.bat launch-hidden.vbs launch.vbs serve-open.ps1 fx-rates.json amazon-news.json .gitignore tools local-tools packages sync-browser.mjs "推送到GitHub.bat" "仅推送GitHub.bat"
      if (Test-Path "app.bundle.js") { git add -f app.bundle.js }
      if (Test-Path "使用说明.txt") { git add "使用说明.txt" }
      if (Test-Path "README.txt") { git add "README.txt" }
      if (Test-Path "启动运营中心.bat") { git add "启动运营中心.bat" }
      if (Test-Path "启动运营中心.vbs") { git add "启动运营中心.vbs" }
    }

    Step "git commit" {
      git commit -m @"
fix: JSONBin cloud sync and visible sync bar (cloud-8)

- Fix sync-browser stripping imports for bundle build
- Skip stale bundle without JSONBin on GitHub Pages
- Prominent cloud sync status bar on shared modules
"@
    }
  } else {
    Log "no local changes to commit"
  }

  Step "git fetch origin" { git fetch origin }

  Stash-IfDirty

  $behind = git rev-list --count HEAD..origin/main 2>$null
  $ahead = git rev-list --count origin/main..HEAD 2>$null
  if ($behind -match '^\d+$' -and [int]$behind -gt 0) {
    Log "remote is $behind commit(s) ahead; rebasing local changes..."
    Step "git pull --rebase origin main" { git pull --rebase origin main }
  } elseif ($ahead -match '^\d+$' -and [int]$ahead -gt 0) {
    Log "commits to push: $ahead"
  }

  Log "git push origin main"
  $ErrorActionPreference = "Continue"
  $pushLines = git push origin main 2>&1 | ForEach-Object { "$_" }
  $ErrorActionPreference = "Stop"
  foreach ($line in $pushLines) { Log $line }

  $pushCode = Get-ExitCode
  if ($pushCode -ne 0) {
    Restore-Stash
    Log "PUSH FAILED (exit $pushCode)."
    if ($pushLines -match "non-fast-forward|rejected") {
      Log "Try: git pull --rebase origin main && git push origin main"
    } else {
      Log "Try: gh auth login && gh auth setup-git"
    }
    exit 1
  }

  Restore-Stash
  Log "push-github done OK"
  Log "Wait 1-2 min, then hard-refresh: https://xiaopong190-oss.github.io/ops-center/"
  exit 0
} catch {
  Restore-Stash
  Log "FAILED: $($_.Exception.Message)"
  exit 1
}
