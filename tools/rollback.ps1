<#
.SYNOPSIS
  One-click rollback for the dsh-update-guard plugin.

.DESCRIPTION
  Restores the desktop DSH profile to the exact state it had before
  dsh-update-guard was installed, WITHOUT needing pnpm or network access.

  It performs four reversible steps:
    1. Restore profiles/desktop/package.json from the pre-install backup.
    2. Remove the plugin from node_modules (only if it is really ours).
    3. Remove the 3 dsh-update-guard blocks from pnpm-lock.yaml.
    4. Leave the vendor/ source directory intact (see -PurgeVendor).

  Safe to run repeatedly. Safe to run while DSH is closed (recommended).
  If DSH is running, it just warns - it does NOT kill any process.

.PARAMETER PurgeVendor
  Also delete vendor/dsh-update-guard (the source copy with tools/).
  Off by default, so you keep the code for debugging / re-installing.

.PARAMETER Force
  Skip the "are you sure" confirmation prompt.

.EXAMPLE
  .\rollback-update-guard.ps1
  Double-click 回滚-update-guard.cmd instead if PowerShell blocks .ps1 files.
#>
[CmdletBinding()]
param(
  [switch]$PurgeVendor,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

# ──────────────────────────────── setup ────────────────────────────────

function Info($m)  { Write-Host "[INFO ] $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "[ OK  ] $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "[WARN ] $m" -ForegroundColor Yellow }
function Fail($m)  { Write-Host "[FAIL ] $m" -ForegroundColor Red }

$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $env:USERPROFILE '.dsh' }
$prof = Join-Path $dshHome 'profiles\desktop'
$pkg  = Join-Path $prof 'package.json'
$lock = Join-Path $prof 'pnpm-lock.yaml'
$nm   = Join-Path $prof 'node_modules\dsh-update-guard'
$vendor = Join-Path $prof 'vendor\dsh-update-guard'

Info "DSH_HOME = $dshHome"
Info "Profile  = $prof"

if (-not (Test-Path -LiteralPath $prof)) {
  Fail "Profile directory not found: $prof"
  Write-Host "Set DSH_HOME to the correct path and re-run." -ForegroundColor Yellow
  if (-not $Force) { Read-Host 'Press Enter to exit' }
  exit 1
}

# ─────────────────────────── locate backup ───────────────────────────

$backups = @(Get-ChildItem -LiteralPath $prof -Filter 'package.json.bak-pre-update-guard-*' -File -ErrorAction SilentlyContinue |
             Sort-Object LastWriteTime -Descending)
if ($backups.Count -eq 0) {
  Fail 'No pre-install backup found (package.json.bak-pre-update-guard-*).'
  Write-Host 'Without it, this script will NOT guess what your old config looked like.' -ForegroundColor Yellow
  if (-not $Force) { Read-Host 'Press Enter to exit' }
  exit 1
}
$bak = $backups[0].FullName
Info "Backup   = $bak"

# Validate the backup is a sane, pre-install package.json.
try {
  $bakJson = Get-Content -LiteralPath $bak -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Fail "Backup is not valid JSON: $($_.Exception.Message)"; exit 1
}
if (-not $bakJson.dsh.profile.bundles) {
  Fail 'Backup has no dsh.profile.bundles - refusing to use it.'; exit 1
}
if ($bakJson.dsh.profile.bundles -contains 'dsh-update-guard') {
  Fail 'Backup itself contains dsh-update-guard - this is not a pre-install backup.'; exit 1
}
Ok "Backup validated ($($bakJson.dsh.profile.bundles.Count) bundles, no update-guard dep)"

# ─────────────────────────── current state ───────────────────────────

$curJson = $null
if (Test-Path -LiteralPath $pkg) {
  try { $curJson = Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
}
$needsRollback = $false
if ($curJson -and (
      $curJson.dsh.profile.bundles -contains 'dsh-update-guard' -or
      $null -ne $curJson.dependencies.'dsh-update-guard')) { $needsRollback = $true }
if (Test-Path -LiteralPath $nm)     { $needsRollback = $true }
if ((Test-Path -LiteralPath $lock) -and (Select-String -LiteralPath $lock -Pattern 'dsh-update-guard' -Quiet)) { $needsRollback = $true }

if (-not $needsRollback) {
  Ok 'Nothing to roll back - profile is already clean.'
  Info 'If DSH still fails to start, the cause is NOT this plugin.'
  if (-not $Force) { Read-Host 'Press Enter to exit' }
  exit 0
}

# ─────────────────────────── running processes ───────────────────────────

$running = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'harness' })
if ($running.Count -gt 0) {
  Warn "DSH appears to be running ($($running.Count) processes)."
  Warn 'This script will NOT kill them. Close DSH fully (including tray) before restarting.'
  Warn 'Editing files underneath a running process is still safe for a rollback.'
}

# ─────────────────────────── confirmation ───────────────────────────

Write-Host ''
Write-Host 'About to roll back dsh-update-guard:' -ForegroundColor White
Write-Host '  1. restore package.json from the pre-install backup' -ForegroundColor Gray
Write-Host '  2. remove node_modules\dsh-update-guard' -ForegroundColor Gray
Write-Host '  3. strip its 3 blocks from pnpm-lock.yaml' -ForegroundColor Gray
if ($PurgeVendor) { Write-Host '  4. DELETE vendor\dsh-update-guard (source, per -PurgeVendor)' -ForegroundColor Yellow }
else              { Write-Host '  4. KEEP vendor\dsh-update-guard (source, unchanged)' -ForegroundColor Gray }
Write-Host ''
if (-not $Force) {
  $answer = Read-Host 'Proceed? [y/N]'
  if ($answer -notmatch '^[yY]') { Warn 'Cancelled, no files changed.'; Read-Host 'Press Enter to exit'; exit 0 }
}

# ─────────────────────────── step 1: package.json ───────────────────────────

try {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $preRollback = Join-Path $prof "package.json.bak-before-rollback-$stamp"
  if (Test-Path -LiteralPath $pkg) { Copy-Item -LiteralPath $pkg -Destination $preRollback -Force }
  Copy-Item -LiteralPath $bak -Destination $pkg -Force
  $chk = Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($chk.dsh.profile.bundles -contains 'dsh-update-guard' -or $null -ne $chk.dependencies.'dsh-update-guard') {
    throw 'restored file still contains dsh-update-guard'
  }
  Ok "package.json restored (pre-rollback copy: $preRollback)"
} catch {
  Fail "Step 1 failed: $($_.Exception.Message)"
  Fail 'Stopping. Nothing else has been changed.'
  if (-not $Force) { Read-Host 'Press Enter to exit' }
  exit 1
}

# ─────────────────────────── step 2: node_modules copy ───────────────────────────

if (Test-Path -LiteralPath $nm) {
  # Safety: only delete if the directory really is our plugin.
  $isOurs = $false
  try {
    $mp = Join-Path $nm 'package.json'
    if (Test-Path -LiteralPath $mp) {
      $mj = Get-Content -LiteralPath $mp -Raw -Encoding UTF8 | ConvertFrom-Json
      $isOurs = ($mj.name -eq 'dsh-update-guard')
    }
  } catch { $isOurs = $false }

  if (-not $isOurs) {
    Warn "Skipped: $nm does not look like dsh-update-guard (name mismatch). Delete it manually if needed."
  } else {
    try {
      Remove-Item -LiteralPath $nm -Recurse -Force
      Ok "Removed $nm"
    } catch {
      Warn "Could not remove $nm : $($_.Exception.Message)"
      Warn 'Close DSH and delete that folder manually; package.json is already restored.'
    }
  }
} else {
  Info 'node_modules copy already absent.'
}

# ─────────────────────────── step 3: pnpm-lock.yaml ───────────────────────────

if (Test-Path -LiteralPath $lock) {
  try {
    $raw = Get-Content -LiteralPath $lock -Raw -Encoding UTF8
    $lines = $raw -split "`r?`n"
    $out = New-Object System.Collections.Generic.List[string]
    $i = 0
    $removed = 0
    while ($i -lt $lines.Count) {
      $line = $lines[$i]

      # (a) importers block: "      dsh-update-guard:" + following specifier/version lines
      if ($line -match '^\s+dsh-update-guard:\s*$') {
        $removed++
        $i++
        while ($i -lt $lines.Count -and $lines[$i] -match '^\s{8,}\S') { $i++ }
        continue
      }
      # (b) packages / snapshots keys: "  dsh-update-guard@file:...:" + its body
      if ($line -match '^\s+dsh-update-guard@') {
        $removed++
        $i++
        while ($i -lt $lines.Count -and $lines[$i] -match '^\s{4,}\S|^\s*$') {
          if ($lines[$i] -match '^\s{0,2}\S') { break }
          $i++
        }
        continue
      }
      # (c) any other line mentioning it (e.g. a stray specifier line)
      if ($line -match 'dsh-update-guard') {
        $removed++
        $i++
        continue
      }
      $out.Add($line)
      $i++
    }
    $newRaw = ($out -join "`n")
    if (-not $newRaw.EndsWith("`n")) { $newRaw += "`n" }
    $lockBak = Join-Path $prof "pnpm-lock.yaml.bak-before-rollback-$stamp"
    Copy-Item -LiteralPath $lock -Destination $lockBak -Force
    Set-Content -LiteralPath $lock -Value $newRaw -Encoding UTF8 -NoNewline
    if (Select-String -LiteralPath $lock -Pattern 'dsh-update-guard' -Quiet) {
      throw 'lockfile still mentions dsh-update-guard after cleanup'
    }
    Ok "pnpm-lock.yaml cleaned ($removed blocks, backup: $lockBak)"
  } catch {
    Warn "Step 3 failed: $($_.Exception.Message)"
    Warn 'A leftover lockfile entry is harmless (pnpm prunes it on next install).'
  }
} else {
  Info 'pnpm-lock.yaml absent, nothing to clean.'
}

# ─────────────────────────── step 4: vendor (optional) ───────────────────────────

if ($PurgeVendor) {
  if (Test-Path -LiteralPath $vendor) {
    try { Remove-Item -LiteralPath $vendor -Recurse -Force; Ok "Removed $vendor" }
    catch { Warn "Could not remove vendor dir: $($_.Exception.Message)" }
  } else { Info 'vendor dir already absent.' }
} else {
  Info "Kept $vendor (source + tools/). Use -PurgeVendor to delete it."
}

# ─────────────────────────── final self-check ───────────────────────────

Write-Host ''
$clean = $true
try {
  $f = Get-Content -LiteralPath $pkg -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($f.dsh.profile.bundles -contains 'dsh-update-guard') { $clean = $false }
  if ($null -ne $f.dependencies.'dsh-update-guard')        { $clean = $false }
} catch { $clean = $false }
if (Test-Path -LiteralPath $nm) { $clean = $false }
if ((Test-Path -LiteralPath $lock) -and (Select-String -LiteralPath $lock -Pattern 'dsh-update-guard' -Quiet)) { $clean = $false }

if ($clean) {
  Ok 'ROLLBACK COMPLETE - profile matches the pre-install state.'
  Write-Host ''
  Write-Host 'Next:' -ForegroundColor White
  Write-Host '  1. Fully quit DSH (including tray), then start it again.' -ForegroundColor Gray
  Write-Host '  2. It should start exactly as before the plugin was installed.' -ForegroundColor Gray
  Write-Host '  3. The GitHub repo is untouched; re-install any time from:' -ForegroundColor Gray
  Write-Host '     https://github.com/flareskyqq/dsh-update-guard' -ForegroundColor Gray
} else {
  Fail 'Rollback incomplete - see warnings above. package.json is already restored, so DSH will still start.'
}

Write-Host ''
if (-not $Force) { Read-Host 'Press Enter to exit' }
