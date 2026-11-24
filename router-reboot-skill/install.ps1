<#
.SYNOPSIS
  Install the router reboot skill on Windows.

.DESCRIPTION
  Copies the skill into the agent skills directory, installs dependencies,
  creates a Task Scheduler entry, and runs the doctor.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1 -Target C:\skills\router-reboot-skill
#>
param(
  [string]$Target = (Join-Path $env:USERPROFILE '.config\opencode\skills\router-reboot-skill'),
  [switch]$NoService
)

$ErrorActionPreference = 'Stop'
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'node is required (18 or newer)'
}
$node = (Get-Command node).Source
$majorText = (& node -p "process.versions.node.split('.')[0]") | Out-String
$major = [int]$majorText.Trim()
if ($major -lt 18) {
  throw "node 18 or newer is required, found $(& node --version)"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is required to install playwright-core'
}

Write-Host "installing into $Target"
New-Item -ItemType Directory -Force -Path $Target | Out-Null

foreach ($item in @('SKILL.md', 'README.md', 'package.json', 'package-lock.json', 'config', 'scripts', 'references', 'systemd', 'launchd', 'windows')) {
  $path = Join-Path $Src $item
  if (Test-Path $path) {
    Copy-Item $path -Destination $Target -Recurse -Force
  }
}

foreach ($required in @('SKILL.md', 'package.json', 'scripts\reboot-router.mjs', 'scripts\watch-limit.mjs', 'scripts\doctor.mjs', 'config\router.config.example.json')) {
  if (-not (Test-Path (Join-Path $Target $required))) {
    throw "install incomplete: missing $required"
  }
}

Write-Host 'installing dependencies'
Push-Location $Target
try {
  if (Test-Path 'package-lock.json') {
    & npm ci --omit=dev --no-audit --no-fund
  } else {
    & npm install --omit=dev --no-audit --no-fund
  }
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
} finally {
  Pop-Location
}

$config = Join-Path $Target 'router.config.json'
if (-not (Test-Path $config)) {
  Copy-Item (Join-Path $Target 'config\router.config.example.json') $config
  Write-Host "created $config - fill in the router details"
} else {
  Write-Host "keeping existing $config"
}

if (-not $NoService) {
  $template = Get-Content (Join-Path $Src 'windows\RouterReboot.xml') -Raw
  $xml = $template.Replace('{{NODE}}', $node).Replace('{{SKILL_DIR}}', $Target)
  $temp = Join-Path $env:TEMP 'RouterReboot.xml'
  Set-Content -Path $temp -Value $xml -Encoding Unicode

  & schtasks /Create /XML $temp /TN RouterReboot /F | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'could not create the scheduled task' }
  Write-Host 'scheduled task created: RouterReboot'
}

Write-Host ''
& node (Join-Path $Target 'scripts\doctor.mjs')

Write-Host @"

Next steps:
  1. Edit $config
  2. cd "$Target"; node scripts/discover.mjs
  3. node scripts/reboot-router.mjs --check
  4. node scripts/reboot-router.mjs --dry-run
"@
