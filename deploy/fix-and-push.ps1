# 备用：PowerShell 版（完成 rebase + push）
$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)
$env:GIT_EDITOR = "true"

Write-Host "fix-and-push start"

if (Test-Path ".git/rebase-merge") {
  Write-Host "rebase in progress..."
  & git checkout --ours amazon-news.json
  & git add amazon-news.json
  & git rebase --continue
  if ($LASTEXITCODE -ne 0) { Write-Host "rebase failed"; exit 1 }
}

Write-Host "git push origin main"
& git push origin main
if ($LASTEXITCODE -ne 0) { Write-Host "push failed"; exit 1 }

Write-Host "DONE OK - Ctrl+F5 https://xiaopong190-oss.github.io/ops-center/"
exit 0
