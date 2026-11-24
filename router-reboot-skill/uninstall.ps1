<#
.SYNOPSIS
  Remove the router reboot skill and its scheduled task.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File uninstall.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File uninstall.ps1 -KeepConfig
#>
param(
  [string]$Target = (Join-Path $env:USERPROFILE '.config\opencode\skills\router-reboot-skill'),
  [switch]$KeepConfig
)

$ErrorActionPreference = 'Stop'

& schtasks /Delete /TN RouterReboot /F 2>$null | Out-Null
Write-Host 'removed scheduled task (if it existed)'

$config = Join-Path $Target 'router.config.json'
if ($KeepConfig -and (Test-Path $config)) {
  Copy-Item $config (Join-Path (Get-Location) 'router.config.backup.json') -Force
  Write-Host 'saved router.config.json to .\router.config.backup.json'
}

if (Test-Path $Target) {
  Remove-Item $Target -Recurse -Force
  Write-Host "removed $Target"
}
