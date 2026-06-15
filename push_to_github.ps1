# ops-center 提交并推送（含美工/KPI/员工角色等改动）
$ErrorActionPreference = "Stop"
Set-Location "D:\Projects\ops-center"
$log = Join-Path $PSScriptRoot "push_result.txt"

function Log($msg) {
    $line = "$(Get-Date -Format o) $msg"
    Write-Host $line
    Add-Content -Path $log -Value $line -Encoding UTF8
}

"" | Set-Content $log -Encoding UTF8
Log "=== ops-center push ==="

git status >> $log 2>&1

# 不提交密钥
git add -A
git reset HEAD src/cloud-sync-config.secret.js 2>$null
git reset HEAD .env 2>$null

$stat = git diff --cached --stat 2>&1
Log "staged:`n$stat"

if (-not (git diff --cached --quiet 2>$null)) {
    git commit -m @"
Add design team KPI, staff roles, and tools UI updates

- 美工 5-point weekly KPI and anonymous ops reviews
- Staff list with role badges (运营/美工/设计/管理)
- Tools page: editable online doc names (e.g. 美工图需)
- Global settings staff editor and role colors
"@
    Log "committed: $(git rev-parse --short HEAD)"
} else {
    Log "nothing to commit"
}

git push -u origin main 2>&1 | ForEach-Object { Log $_ }
Log "final: $(git log -1 --oneline)"
Log "=== OK ==="
