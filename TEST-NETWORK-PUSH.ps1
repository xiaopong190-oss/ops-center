# 测试 GitHub 网络 + push 是否通畅（Hermes 改网络后排查用）
# 用法：右键「使用 PowerShell 运行」，或在 PowerShell 里：
#   cd D:\Projects\ops-center
#   powershell -ExecutionPolicy Bypass -File .\TEST-NETWORK-PUSH.ps1

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot
$out = Join-Path $PSScriptRoot "_test-network-push.txt"

function Log($s) {
  $line = "[$(Get-Date -Format 'HH:mm:ss')] $s"
  Write-Host $line
  Add-Content $out $line -Encoding UTF8
}

"" | Set-Content $out -Encoding UTF8
Log "========== TEST START =========="

Log "--- 1) 环境变量代理 ---"
Log "HTTP_PROXY  = [$env:HTTP_PROXY]"
Log "HTTPS_PROXY = [$env:HTTPS_PROXY]"
Log "ALL_PROXY   = [$env:ALL_PROXY]"
Log "NO_PROXY    = [$env:NO_PROXY]"

Log "--- 2) Git 代理配置（Hermes/Clash 常会改这里）---"
$gitHttp = git config --global --get http.proxy 2>$null
$gitHttps = git config --global --get https.proxy 2>$null
Log "git config http.proxy  = [$gitHttp]"
Log "git config https.proxy = [$gitHttps]"

Log "--- 3) TCP 443 到 github.com ---"
try {
  $tcp = Test-NetConnection github.com -Port 443 -WarningAction SilentlyContinue
  Log "TcpTestSucceeded = $($tcp.TcpTestSucceeded)"
} catch {
  Log "Test-NetConnection error: $_"
}

Log "--- 4) git ls-remote（能否连上 GitHub）---"
$ls = git ls-remote origin HEAD 2>&1 | Out-String
Log $ls.Trim()
if ($LASTEXITCODE -eq 0) { Log "ls-remote: OK" } else { Log "ls-remote: FAIL (exit $LASTEXITCODE)" }

Log "--- 5) 本地状态 ---"
git remote -v 2>&1 | ForEach-Object { Log $_ }
git status -sb 2>&1 | ForEach-Object { Log $_ }
$ahead = git rev-list --count origin/main..HEAD 2>$null
$behind = git rev-list --count HEAD..origin/main 2>$null
Log "ahead of origin/main: $ahead | behind: $behind"
Log "HEAD: $(git log -1 --oneline 2>&1)"

if ([int]$ahead -gt 0 -or (git status --porcelain tools/fba-hanhai-converter 2>$null)) {
  Log "--- 6) 暂存 FBA 工具（如有改动）---"
  git add tools/fba-hanhai-converter/ src/ToolsModule.jsx src/ToolsModule.browser.jsx 2>&1 | ForEach-Object { Log $_ }
  $cached = git diff --cached --name-only 2>&1
  if ($cached) {
    git commit -m "feat(tools): FBA Hanhai converter with Lingxing SKU database" 2>&1 | ForEach-Object { Log $_ }
    Log "new HEAD: $(git log -1 --oneline)"
  } else {
    Log "nothing new to commit"
  }
}

Log "--- 7) 若落后远程，先 pull --rebase ---"
git fetch origin main 2>&1 | ForEach-Object { Log $_ }
$behind2 = git rev-list --count HEAD..origin/main 2>$null
if ([int]$behind2 -gt 0) {
  Log "behind $behind2 commits, running pull --rebase..."
  git pull --rebase origin main 2>&1 | ForEach-Object { Log $_ }
  if ($LASTEXITCODE -ne 0) {
    Log "REBASE FAILED — 若有 amazon-news.json 冲突，可："
    Log "  git checkout --theirs amazon-news.json; git add amazon-news.json; git rebase --continue"
    Log "  或: git rebase --abort"
    Log "========== TEST END (rebase blocked) =========="
    Read-Host "按 Enter 关闭"
    exit 1
  }
}

Log "--- 8) git push origin main ---"
git push origin main 2>&1 | ForEach-Object { Log $_ }
if ($LASTEXITCODE -eq 0) {
  Log "PUSH OK — 1~2 分钟后 GitHub Actions 部署，浏览器 Ctrl+F5"
  Log "https://github.com/xiaopong190-oss/ops-center/actions"
} else {
  Log "PUSH FAIL exit=$LASTEXITCODE"
  if ($ls -match "127\.0\.0\.1") {
    Log "提示: 错误里出现 127.0.0.1 = 代理开着但梯子/Clash 没运行，或代理端口不对"
    Log "  开 VPN 后重试，或清除代理: git config --global --unset http.proxy"
  }
}

Log "========== TEST END =========="
Read-Host "按 Enter 关闭"
