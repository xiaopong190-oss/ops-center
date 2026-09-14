$ErrorActionPreference = 'Stop'
$raw = Get-Content -LiteralPath 'C:\Users\15869\.codex\config.toml' -Raw
function Read-ConfigString($sectionName, $fieldName) {
  $section = [regex]::Match($raw, '(?ms)^\[' + [regex]::Escape($sectionName) + '\]\s*\r?\n(.*?)(?=^\[|\z)').Groups[1].Value
  $match = [regex]::Match($section, '(?m)^' + [regex]::Escape($fieldName) + '\s*=\s*(".*")\s*$')
  if ($match.Success) { return (ConvertFrom-Json $match.Groups[1].Value) }
  return ''
}
$env:MCP_ENDPOINT = Read-ConfigString 'mcp_servers.xydc-mcp' 'url'
$env:MCP_API_KEY = Read-ConfigString 'mcp_servers.xydc-mcp.http_headers' 'Authorization'
$env:MCP_AUTH_HEADER = 'Authorization'
$env:MCP_AUTH_PREFIX = ''
$env:SELLER_MCP_ENDPOINT = Read-ConfigString 'mcp_servers.sell-mcp' 'url'
$env:SELLER_MCP_KEY = Read-ConfigString 'mcp_servers.sell-mcp.http_headers' 'secret-key'
$env:SELLER_MCP_HEADER = 'secret-key'
$process = Start-Process -FilePath 'D:\Program Files\nodejs\node.exe' -ArgumentList 'proxy/server.js' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PSScriptRoot 'proxy/runtime.log') -RedirectStandardError (Join-Path $PSScriptRoot 'proxy/runtime-error.log')
$process.Id | Set-Content (Join-Path $PSScriptRoot 'proxy/runtime.pid')
Write-Output ('Started local MCP console: ' + $process.Id)
