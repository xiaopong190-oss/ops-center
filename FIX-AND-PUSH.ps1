# 解决 amazon-news.json 冲突 + 提交 FBA 工具 + push
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "_fix-push-result.txt"
"" | Set-Content $log -Encoding UTF8

function Log($s) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $s"
  Add-Content $log $line -Encoding UTF8
  Write-Host $line
}

Log "========== FIX & PUSH =========="

if (Test-Path ".git/rebase-merge") {
  Log "检测到 rebase 进行中"
} elseif (Test-Path ".git/MERGE_HEAD") {
  Log "检测到 merge 进行中"
} else {
  Log "无进行中的 rebase/merge（仅未合并文件）"
}

Log "--- 1) 用远程 main 的 amazon-news.json 解决冲突 ---"
git fetch origin main 2>&1 | ForEach-Object { Log $_ }
git checkout origin/main -- amazon-news.json 2>&1 | ForEach-Object { Log $_ }
git add amazon-news.json 2>&1 | ForEach-Object { Log $_ }

if (Test-Path ".git/rebase-merge") {
  Log "rebase --continue"
  git -c core.editor=true rebase --continue 2>&1 | ForEach-Object { Log $_ }
}

if (Test-Path ".git/MERGE_HEAD") {
  Log "merge commit"
  git -c core.editor=true commit --no-edit 2>&1 | ForEach-Object { Log $_ }
}

Log "--- 2) status after conflict fix ---"
git status -sb 2>&1 | ForEach-Object { Log $_ }

Log "--- 3) commit local changes first (required before rebase) ---"
git add tools/fba-hanhai-converter/ src/ToolsModule.jsx src/ToolsModule.browser.jsx src/GlobalConfig.jsx deploy/sync-cloud-snapshot.mjs deploy/snapshot-seeds/ deploy/patch-gist-lingxing-sku.mjs deploy/seed-github-gist.mjs 2>&1 | ForEach-Object { Log $_ }
$unstaged = git status --porcelain 2>&1
$cached = git diff --cached --name-only 2>&1
if ($cached) {
  git commit -m @"
feat(tools): FBA Hanhai converter + Lingxing SKU GitHub team sync

- Lingxing SKU import (CSV/XLS), auto-match on FBA CSV upload
- GitHub Gist team DB: pull/push + Pages snapshot fallback
- Local save for declare price/material; brand default non
- Skip ASIN/FNSKU/SKU in Hanhai export; en_name 3-5 words
"@ 2>&1 | ForEach-Object { Log $_ }
  Log "commit: $(git log -1 --oneline)"
} else {
  Log "nothing new to commit (already committed or clean)"
}
if ($unstaged -match '^(M|A|D|\?\?)') {
  Log "WARN: still have unstaged files — stash before rebase if pull fails:"
  Log $unstaged
}

Log "--- 4) rebase onto origin/main ---"
git pull --rebase origin main 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -ne 0) {
  Log "rebase failed — 若有冲突：改完文件后 git add . && git rebase --continue"
  Log "或放弃：git rebase --abort"
  Read-Host "Enter"
  exit 1
}

Log "--- 5) push ---"
git push origin main 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -eq 0) {
  Log "PUSH OK"
  Log "https://github.com/xiaopong190-oss/ops-center/actions"
} else {
  Log "PUSH FAIL exit=$LASTEXITCODE"
}

Log "final status:"
git status -sb 2>&1 | ForEach-Object { Log $_ }
Log "========== DONE =========="
Read-Host "Enter"
