Set-Location "D:\Projects\ops-center"
$log = @()
function Log($msg) { $script:log += $msg; Write-Output $msg }

Log "=== fetch ==="
Log (git fetch origin main 2>&1 | Out-String)

Log "=== pull --rebase --autostash ==="
Log (git pull --rebase --autostash origin main 2>&1 | Out-String)

if ($LASTEXITCODE -ne 0) {
  Log "REBASE FAILED exit=$LASTEXITCODE"
  $log | Set-Content -Path "_push-out.txt" -Encoding utf8
  exit $LASTEXITCODE
}

Log "=== push ==="
Log (git push origin main 2>&1 | Out-String)

Log "=== final ==="
Log (git log -1 --oneline 2>&1 | Out-String)
Log (git status -sb 2>&1 | Out-String)

$log | Set-Content -Path "_push-out.txt" -Encoding utf8
