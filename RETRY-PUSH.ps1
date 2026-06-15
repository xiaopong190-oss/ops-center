Set-Location "D:\Projects\ops-center"
$log = @()

function Log($msg) { $script:log += $msg; Write-Output $msg }

Log "=== git status ==="
Log (git status --short 2>&1 | Out-String)

Log "=== git diff tools/fba-hanhai-converter ==="
Log (git diff --stat tools/fba-hanhai-converter/ 2>&1 | Out-String)

Log "=== pull --rebase ==="
Log (git pull --rebase origin main 2>&1 | Out-String)

Log "=== git add ==="
git add tools/fba-hanhai-converter/ 2>&1 | ForEach-Object { Log $_ }

Log "=== git commit ==="
git commit -m "FBA Hanhai converter: embed 100x100 product images, fix hyperlink import, auto-save on ZIP import" 2>&1 | ForEach-Object { Log $_ }

Log "=== git push ==="
git push origin main 2>&1 | ForEach-Object { Log $_ }

Log "=== final ==="
Log (git log -1 --oneline 2>&1 | Out-String)
Log (git status -sb 2>&1 | Out-String)

$log | Set-Content -Path "_push-out.txt" -Encoding utf8
