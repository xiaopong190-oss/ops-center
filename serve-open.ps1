$ErrorActionPreference = "Stop"
$port = 8765
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://127.0.0.1:$port/app.html"
$entry = Join-Path $root "app.html"
$diskCleanerDir = Join-Path $root "local-tools\disk-cleaner"
$packScript = Join-Path $root "deploy\pack-disk-cleaner.ps1"
$mailwatchDir = "D:\Projects\mailwatch"
if (-not (Test-Path -LiteralPath $mailwatchDir)) {
  $mailwatchDir = Join-Path (Split-Path $root -Parent) "mailwatch"
}
$mailwatchPort = 8000
$mailwatchUrl = "http://127.0.0.1:$mailwatchPort"

$fbaSrc = "d:\自改小工具\FBA工具\index.html"
$fbaDest = Join-Path $root "fba-profit-calculator.html"
if ((Test-Path -LiteralPath $fbaSrc) -and -not (Test-Path -LiteralPath $fbaDest)) {
  Copy-Item -LiteralPath $fbaSrc -Destination $fbaDest -Force
  Write-Host "Copied FBA profit calculator to $fbaDest"
}
$whSrc = "d:\自改小工具\FBA分仓工具\index.html"
$whDest = Join-Path $root "fba-warehouse-tool.html"
if ((Test-Path -LiteralPath $whSrc) -and -not (Test-Path -LiteralPath $whDest)) {
  Copy-Item -LiteralPath $whSrc -Destination $whDest -Force
  Write-Host "Copied FBA warehouse tool to $whDest"
}

if (Test-Path -LiteralPath $packScript) {
  try {
    & $packScript | Out-Null
  } catch {
    Write-Host "pack-disk-cleaner skipped: $($_.Exception.Message)"
  }
}

function Write-JsonResponse {
  param($Response, [hashtable]$Data, [int]$StatusCode = 200)
  $json = ($Data | ConvertTo-Json -Compress -Depth 5)
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Test-LocalRequest {
  param($Request)
  $addr = $Request.RemoteEndPoint.Address.ToString()
  return ($addr -eq "127.0.0.1") -or ($addr -eq "::1")
}

function Start-DiskCleanerProcess {
  param([string]$ScriptName, [string]$Title)
  $scriptPath = Join-Path $diskCleanerDir $ScriptName
  if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Script not found: $scriptPath"
  }
  $cmd = "-NoProfile -ExecutionPolicy Bypass -NoExit -File `"$scriptPath`""
  Start-Process -FilePath "powershell.exe" -ArgumentList $cmd -WorkingDirectory $diskCleanerDir | Out-Null
}

function Test-MailWatchRunning {
  try {
    $r = Invoke-WebRequest -Uri "$mailwatchUrl/health" -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Handle-MailWatchApi {
  param($Request, $Response, [string]$Path)

  if (-not (Test-LocalRequest $Request)) {
    Write-JsonResponse $Response @{ ok = $false; error = "API only available on localhost" } 403
    return $true
  }

  if ($Path -eq "/api/mailwatch/status") {
    $installed = Test-Path -LiteralPath (Join-Path $mailwatchDir "main.py")
    Write-JsonResponse $Response @{
      ok = $true
      localServer = $true
      running = (Test-MailWatchRunning)
      mailwatchInstalled = $installed
      mailwatchDir = $mailwatchDir
      appUrl = $mailwatchUrl
    }
    return $true
  }

  if ($Path -eq "/api/mailwatch/launch" -and $Request.HttpMethod -eq "POST") {
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $body = $reader.ReadToEnd()
    $reader.Close()
    $action = "start"
    if ($body) {
      try {
        $parsed = $body | ConvertFrom-Json
        if ($parsed.action) { $action = [string]$parsed.action }
      } catch { }
    }

    if (-not (Test-Path -LiteralPath (Join-Path $mailwatchDir "start.bat"))) {
      Write-JsonResponse $Response @{ ok = $false; error = "MailWatch not found: $mailwatchDir" } 404
      return $true
    }

    try {
      if ($action -eq "start") {
        Start-Process -FilePath (Join-Path $mailwatchDir "start.bat") -WorkingDirectory $mailwatchDir | Out-Null
        Write-JsonResponse $Response @{
          ok = $true
          message = "已启动 MailWatch（请查看弹出的命令行窗口，勿关闭）"
          mailwatchDir = $mailwatchDir
          appUrl = $mailwatchUrl
        }
      } elseif ($action -eq "open") {
        Write-JsonResponse $Response @{
          ok = $true
          message = "请在浏览器打开 MailWatch"
          appUrl = $mailwatchUrl
        }
      } else {
        Write-JsonResponse $Response @{ ok = $false; error = "Unknown action: $action" } 400
      }
    } catch {
      Write-JsonResponse $Response @{ ok = $false; error = $_.Exception.Message } 500
    }
    return $true
  }

  return $false
}

function Get-BeijingTodayKey {
  try {
    $tz = [TimeZoneInfo]::FindSystemTimeZoneById("China Standard Time")
    $now = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $tz)
    return $now.ToString("yyyy-MM-dd")
  } catch {
    return (Get-Date).ToString("yyyy-MM-dd")
  }
}

function Get-LocalPhysicalIp {
  try {
    $preferred = $null
    $others = @()
    $ifaces = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -notmatch '^127\.' -and
        $_.IPAddress -notmatch '^169\.254\.' -and
        $_.PrefixOrigin -ne 'WellKnown'
      }
    foreach ($iface in $ifaces) {
      $ip = [string]$iface.IPAddress
      if ($ip -match '^192\.168\.') { return $ip }
      if ($ip -match '^10\.' -or $ip -match '^172\.(1[6-9]|2[0-9]|3[01])\.') {
        $others += $ip
      }
    }
    if ($others.Count -gt 0) { return $others[0] }
    if ($ifaces.Count -gt 0) { return [string]$ifaces[0].IPAddress }
  } catch { }
  return "127.0.0.1"
}

function Get-PhysicalClientId {
  param($Request)
  $remote = $Request.RemoteEndPoint.Address.ToString()
  if ($remote -eq "127.0.0.1" -or $remote -eq "::1") {
    return Get-LocalPhysicalIp
  }
  if ($remote -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)') {
    return $remote
  }
  return Get-LocalPhysicalIp
}

function Get-ClientIdFromRequest {
  param($Request)
  return Get-PhysicalClientId $Request
}

function Get-PriorityStorePath {
  Join-Path $root "data\daily-priorities.json"
}

function Read-PriorityStore {
  $path = Get-PriorityStorePath
  if (-not (Test-Path -LiteralPath $path)) { return @{} }
  try {
    $raw = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8)
    if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
    $parsed = $raw | ConvertFrom-Json
    $map = @{}
    foreach ($prop in $parsed.PSObject.Properties) {
      $map[$prop.Name] = [string]$prop.Value
    }
    return $map
  } catch {
    return @{}
  }
}

function Write-PriorityStore {
  param([hashtable]$Map)
  $path = Get-PriorityStorePath
  $dir = Split-Path -Parent $path
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $obj = New-Object PSObject
  foreach ($key in ($Map.Keys | Sort-Object)) {
    $obj | Add-Member -NotePropertyName $key -NotePropertyValue $Map[$key]
  }
  $json = ($obj | ConvertTo-Json -Compress)
  [IO.File]::WriteAllText($path, $json, [Text.Encoding]::UTF8)
}

function Get-PriorityStoreKey {
  param([string]$ClientId, [string]$Date)
  return "$ClientId|$Date"
}

function Handle-PriorityApi {
  param($Request, $Response, [string]$Path)

  if ($Path -eq "/api/client-id") {
    $id = Get-PhysicalClientId $Request
    Write-JsonResponse $Response @{ ok = $true; clientId = $id; type = "lan" }
    return $true
  }

  if ($Path -eq "/api/priority" -and $Request.HttpMethod -eq "GET") {
    $clientId = Get-PhysicalClientId $Request
    $date = Get-BeijingTodayKey
    $qDate = $Request.QueryString["date"]
    if ($qDate) { $date = [string]$qDate }
    $store = Read-PriorityStore
    $key = Get-PriorityStoreKey $clientId $date
    $text = ""
    if ($store.ContainsKey($key)) { $text = [string]$store[$key] }
    Write-JsonResponse $Response @{ ok = $true; clientId = $clientId; date = $date; text = $text }
    return $true
  }

  if ($Path -eq "/api/priority" -and $Request.HttpMethod -eq "POST") {
    $clientId = Get-PhysicalClientId $Request
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $body = $reader.ReadToEnd()
    $reader.Close()
    $text = ""
    $date = Get-BeijingTodayKey
    if ($body) {
      try {
        $parsed = $body | ConvertFrom-Json
        if ($parsed.text) { $text = [string]$parsed.text.Trim() }
        if ($parsed.date) { $date = [string]$parsed.date }
      } catch { }
    }
    if (-not $text) {
      Write-JsonResponse $Response @{ ok = $false; error = "empty priority" } 400
      return $true
    }
    $store = Read-PriorityStore
    $key = Get-PriorityStoreKey $clientId $date
    $store[$key] = $text
    Write-PriorityStore $store
    Write-JsonResponse $Response @{ ok = $true; clientId = $clientId; date = $date; text = $text }
    return $true
  }

  return $false
}

function Handle-DiskCleanerApi {
  param($Request, $Response, [string]$Path)

  if (-not (Test-LocalRequest $Request)) {
    Write-JsonResponse $Response @{ ok = $false; error = "API only available on localhost" } 403
    return $true
  }

  if ($Path -eq "/api/disk-cleaner/status") {
    Write-JsonResponse $Response @{
      ok = $true
      localServer = $true
      toolDir = $diskCleanerDir
      downloadUrl = "/packages/disk-cleaner-win.zip"
    }
    return $true
  }

  if ($Path -eq "/api/disk-cleaner/launch" -and $Request.HttpMethod -eq "POST") {
    $reader = New-Object System.IO.StreamReader($Request.InputStream, $Request.ContentEncoding)
    $body = $reader.ReadToEnd()
    $reader.Close()
    $action = "preview"
    if ($body) {
      try {
        $parsed = $body | ConvertFrom-Json
        if ($parsed.action) { $action = [string]$parsed.action }
      } catch { }
    }

    try {
      switch ($action) {
        "scan" {
          $arg = "-NoProfile -ExecutionPolicy Bypass -NoExit -Command `"& { Set-Location '$diskCleanerDir'; & '.\Scan-JunkSoftware.ps1' -ExportReport }`""
          Start-Process -FilePath "powershell.exe" -ArgumentList $arg -WorkingDirectory $diskCleanerDir | Out-Null
          Write-JsonResponse $Response @{ ok = $true; message = "已启动扫描，报告将保存到桌面 junk-scan-report.md" }
        }
        "preview" {
          $arg = "-NoProfile -ExecutionPolicy Bypass -NoExit -Command `"& { Set-Location '$diskCleanerDir'; & '.\Clean-Residuals.ps1' }`""
          Start-Process -FilePath "powershell.exe" -ArgumentList $arg -WorkingDirectory $diskCleanerDir | Out-Null
          Write-JsonResponse $Response @{ ok = $true; message = "已打开预览窗口（只读，不会删除）" }
        }
        "cleanup" {
          Start-DiskCleanerProcess "Start-Cleanup.ps1" "Cleanup"
          Write-JsonResponse $Response @{ ok = $true; message = "已打开一键清理窗口，请按提示输入 Y 确认" }
        }
        "folder" {
          if (Test-Path -LiteralPath $diskCleanerDir) {
            Start-Process explorer.exe $diskCleanerDir | Out-Null
          }
          Write-JsonResponse $Response @{ ok = $true; message = "已打开工具文件夹" }
        }
        default {
          Write-JsonResponse $Response @{ ok = $false; error = "Unknown action: $action" } 400
        }
      }
    } catch {
      Write-JsonResponse $Response @{ ok = $false; error = $_.Exception.Message } 500
    }
    return $true
  }

  return $false
}

function Sync-AmazonNewsIfNeeded {
  param([switch]$Force)
  $dest = Join-Path $root "amazon-news.json"
  $script = Join-Path $root "sync-amazon-news.mjs"
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node -or -not (Test-Path -LiteralPath $script)) { return }

  $stale = $true
  if (-not $Force -and (Test-Path -LiteralPath $dest)) {
    $age = (Get-Date) - (Get-Item -LiteralPath $dest).LastWriteTime
    if ($age.TotalHours -lt 4) { $stale = $false }
  }
  if (-not $stale) { return }

  try {
    $args = @($script)
    if ($Force) { $args += "--force" }
    & $node.Source @args 2>$null | Out-Null
  } catch {
    Write-Host "amazon-news sync skipped: $($_.Exception.Message)"
  }
}

function Handle-AmazonNewsApi {
  param($Request, $Response, [string]$Path)

  if ($Path -ne "/api/amazon-news") { return $false }

  $dest = Join-Path $root "amazon-news.json"
  Sync-AmazonNewsIfNeeded

  if (-not (Test-Path -LiteralPath $dest)) {
    Write-JsonResponse $Response @{ ok = $false; error = "news unavailable" } 503
    return $true
  }

  try {
    $json = Get-Content -LiteralPath $dest -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-JsonResponse $Response @{ ok = $true; news = $json }
  } catch {
    Write-JsonResponse $Response @{ ok = $false; error = $_.Exception.Message } 500
  }
  return $true
}

function Show-StartupError {
  param([string]$Message)
  try {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show($Message, "Ops Center", "OK", "Error") | Out-Null
  } catch {
    Write-Host $Message
  }
}

function Hide-ConsoleWindow {
  try {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public class OpsCenterWin32 {
  [DllImport("kernel32.dll")]
  public static extern IntPtr GetConsoleWindow();
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
    $hwnd = [OpsCenterWin32]::GetConsoleWindow()
    if ($hwnd -ne [IntPtr]::Zero) {
      [OpsCenterWin32]::ShowWindow($hwnd, 0) | Out-Null
    }
  } catch { }
}

function Open-Fallback {
  param([string]$Reason = "")

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    Start-Process -FilePath $python.Source -ArgumentList "-m", "http.server", [string]$port, "-d", $root -WindowStyle Hidden
    Start-Sleep -Seconds 1
    Start-Process $url
    Hide-ConsoleWindow
    exit 0
  }
  if (Test-Path $entry) {
    Start-Process $entry
    $msg = "本地服务启动失败，已直接打开页面（部分功能可能不可用）。"
    if ($Reason) { $msg += "`n`n$Reason" }
    Show-StartupError $msg
    exit 0
  }
  Show-StartupError "启动失败：找不到 app.html`n路径：$root"
  exit 1
}

function Get-MimeType {
  param([string]$FilePath)
  switch ([IO.Path]::GetExtension($FilePath).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".htm"  { "text/html; charset=utf-8" }
    ".jsx"  { "text/javascript; charset=utf-8" }
    ".js"   { "text/javascript; charset=utf-8" }
    ".css"  { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".svg"  { "image/svg+xml" }
    ".zip"  { "application/zip" }
    ".txt"  { "text/plain; charset=utf-8" }
    ".md"   { "text/markdown; charset=utf-8" }
    default { "application/octet-stream" }
  }
}

function Set-NoCacheHeaders {
  param($Response, [string]$FilePath)
  $ext = [IO.Path]::GetExtension($FilePath).ToLowerInvariant()
  if ($ext -in @(".html", ".htm", ".jsx", ".js")) {
    $Response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
    $Response.Headers.Add("Pragma", "no-cache")
    $Response.Headers.Add("Expires", "0")
  }
}

function Sync-BrowserBundleIfStale {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) { return }
  $bundle = Join-Path $root "app.bundle.js"
  $sources = @(
    (Join-Path $root "src\LogisticsModule.jsx"),
    (Join-Path $root "src\FBAGanttCard.jsx"),
    (Join-Path $root "src\LogisticsModule.browser.jsx"),
    (Join-Path $root "sync-browser.mjs"),
    (Join-Path $root "deploy\build-browser-bundle.mjs")
  )
  $needs = -not (Test-Path -LiteralPath $bundle)
  if (-not $needs) {
    $bundleTime = (Get-Item -LiteralPath $bundle).LastWriteTimeUtc
    foreach ($src in $sources) {
      if ((Test-Path -LiteralPath $src) -and (Get-Item -LiteralPath $src).LastWriteTimeUtc -gt $bundleTime) {
        $needs = $true
        break
      }
    }
  }
  if (-not $needs) { return }
  Write-Host "Rebuilding app.bundle.js (sources changed)..."
  & $node.Source (Join-Path $root "sync-browser.mjs")
  if ($LASTEXITCODE -ne 0) { throw "sync-browser failed" }
  & $node.Source (Join-Path $root "deploy\build-browser-bundle.mjs")
  if ($LASTEXITCODE -ne 0) { throw "build-browser-bundle failed" }
}

try {
  Sync-BrowserBundleIfStale
  Sync-AmazonNewsIfNeeded
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://127.0.0.1:$port/")
  $listener.Start()
} catch {
  Open-Fallback -Reason $_.Exception.Message
}

Start-Sleep -Milliseconds 300
Start-Process $url
Hide-ConsoleWindow

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response

  $rel = [Uri]::UnescapeDataString($request.Url.LocalPath.TrimStart("/"))
  $apiPath = $request.Url.LocalPath

  if (Handle-MailWatchApi $request $response $apiPath) {
    $response.OutputStream.Close()
    continue
  }

  if (Handle-PriorityApi $request $response $apiPath) {
    $response.OutputStream.Close()
    continue
  }

  if (Handle-DiskCleanerApi $request $response $apiPath) {
    $response.OutputStream.Close()
    continue
  }

  if (Handle-AmazonNewsApi $request $response $apiPath) {
    $response.OutputStream.Close()
    continue
  }

  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "app.html" }
  $file = Join-Path $root ($rel -replace "/", [IO.Path]::DirectorySeparatorChar)

  if (Test-Path $file -PathType Leaf) {
    $bytes = [IO.File]::ReadAllBytes($file)
    $response.ContentType = Get-MimeType $file
    Set-NoCacheHeaders $response $file
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $msg = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
    $response.StatusCode = 404
    $response.ContentType = "text/plain; charset=utf-8"
    $response.ContentLength64 = $msg.Length
    $response.OutputStream.Write($msg, 0, $msg.Length)
  }

  $response.OutputStream.Close()
}
