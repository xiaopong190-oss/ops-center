$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$node='D:\Program Files\nodejs\node.exe'
$created=$false
$mutex=[Threading.Mutex]::new($true,'Local\OpsFollowupDisk',[ref]$created)
if(-not $created){$mutex.Dispose();exit}
Set-Location -LiteralPath $root
Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class OpsDiskPower { [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags); }'
[OpsDiskPower]::SetThreadExecutionState([uint32]2147483649) | Out-Null
while($true){
  try { & $node (Join-Path $root 'client.mjs') 1>> (Join-Path $root 'data\process.log') 2>> (Join-Path $root 'data\process-errors.log') } catch { Add-Content -LiteralPath (Join-Path $root 'data\supervisor.log') -Value ((Get-Date -Format o)+' restarting data process') }
  Start-Sleep -Seconds 5
}
