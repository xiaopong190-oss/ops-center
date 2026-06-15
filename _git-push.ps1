Set-Location "D:\Projects\ops-center"
$log = @()

function Log($msg) { $script:log += $msg; Write-Output $msg }

Log "=== git status ==="
Log (git status 2>&1 | Out-String)

Log "=== git diff --stat ==="
Log (git diff --stat 2>&1 | Out-String)

Log "=== git log -3 ==="
Log (git log -3 --oneline 2>&1 | Out-String)

Log "=== git branch -vv ==="
Log (git branch -vv 2>&1 | Out-String)

$porcelain = git status --porcelain 2>&1
if ($porcelain) {
  git add tools/fba-hanhai-converter/ src/ToolsModule.jsx src/ToolsModule.browser.jsx 2>&1 | ForEach-Object { Log $_ }
  git commit -m "Add FBA to Hanhai B2B converter tool to tools page" 2>&1 | ForEach-Object { Log $_ }
  git push 2>&1 | ForEach-Object { Log $_ }
  Log "=== git status after ==="
  Log (git status 2>&1 | Out-String)
} else {
  Log "No changes to commit."
}

$log | Set-Content -Path "D:\Projects\ops-center\_git-push.log" -Encoding UTF8
