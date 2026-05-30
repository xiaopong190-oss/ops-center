$dir = "D:\Projects\ops-center\src"
$root = "D:\Projects\ops-center"
node "$root\copy-fba-tools.mjs" 2>$null
node "$root\sync-browser.mjs"
if ($LASTEXITCODE -ne 0) { Write-Error "sync-browser.mjs failed"; exit 1 }
Write-Output "sync-browser done"
