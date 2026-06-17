# ops-center 提交并推送（美工/KPI 等）
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "push_result.txt"

function Log($msg) {
    $line = "$(Get-Date -Format o) $msg"
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding UTF8
}

"" | Set-Content $log -Encoding UTF8
Log "=== ops-center push ==="

# 只提交源码与部署，不提交 push 临时脚本/日志
git add src/ deploy/ app.html index.html package.json vite.config.js README.md .gitignore
git add local-tools/ 2>$null
git reset HEAD src/cloud-sync-config.secret.js 2>$null
git reset HEAD .env 2>$null

$stat = git diff --cached --stat 2>&1 | Out-String
Log "staged:`n$stat"

if (-not (git diff --cached --quiet 2>$null)) {
    git commit -m @"
Add design team KPI, staff roles, and tools UI updates

- 美工 5-point weekly KPI and anonymous ops reviews
- Staff list with role badges (运营/美工/设计/管理)
- Tools page: editable online doc names (e.g. 美工图需)
"@
    if ($LASTEXITCODE -ne 0) { Log "commit failed"; exit 1 }
    Log "committed: $(git rev-parse --short HEAD)"
} else {
    Log "nothing new to commit"
}

Log "git fetch + pull --rebase"
git fetch origin 2>&1 | ForEach-Object { Log $_ }
git pull --rebase origin main 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) {
    Log "PULL/REBASE FAILED — 若有冲突，解决后: git add . && git rebase --continue && 再跑本脚本"
    exit 1
}

Log "git push"
git push origin main 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) {
    Log "PUSH FAILED exit=$LASTEXITCODE"
    exit 1
}

Log "final: $(git log -1 --oneline)"
Log "remote: $(git rev-parse origin/main 2>$null)"
Log "=== OK ==="
